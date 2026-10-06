//! Native database access for MySQL, MariaDB, PostgreSQL, SQLite and SQL Server.
//! Rows are streamed and capped at `max_rows`; the UI pages client-side and never loads whole tables.

use crate::tunnel::{self, Tunnel};
use futures::{StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::mysql::{MySqlConnectOptions, MySqlPoolOptions, MySqlSslMode};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Column, Executor, Row, TypeInfo, ValueRef};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::State;
use tokio::sync::Mutex;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Cfg {
    pub engine: String,
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub database: String,
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub ssl: bool,
    #[serde(default)]
    pub ssh_enabled: bool,
    #[serde(default)]
    pub ssh_host: String,
    #[serde(default)]
    pub ssh_port: u16,
    #[serde(default)]
    pub ssh_user: String,
    #[serde(default)]
    pub timeout_seconds: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    columns: Vec<String>,
    rows: Vec<Vec<Value>>,
    affected: u64,
    elapsed_ms: f64,
    truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    ok: bool,
    message: String,
    server_version: Option<String>,
}

type MssqlClient = tiberius::Client<Compat<tokio::net::TcpStream>>;

#[derive(Clone)]
enum Conn {
    My(sqlx::MySqlPool),
    Pg(sqlx::PgPool),
    Lite(sqlx::SqlitePool),
    Ms(Arc<Mutex<MssqlClient>>),
}

struct Session {
    conn: Conn,
    _tunnel: Option<Tunnel>,
    abort: Option<tokio::task::AbortHandle>,
}

#[derive(Default)]
pub struct Sessions(Mutex<HashMap<String, Session>>);

fn timeout(cfg: &Cfg) -> Duration {
    Duration::from_secs(cfg.timeout_seconds.clamp(1, 120))
}

async fn open(cfg: &Cfg) -> Result<(Conn, Option<Tunnel>), String> {
    let (host, port, tunnel) = if cfg.ssh_enabled && cfg.engine != "sqlite" {
        let (sh, sp, su, h, p) = (cfg.ssh_host.clone(), cfg.ssh_port.max(1), cfg.ssh_user.clone(), cfg.host.clone(), cfg.port);
        let t = tokio::task::spawn_blocking(move || tunnel::open(&sh, if sp == 0 { 22 } else { sp }, &su, &h, p))
            .await
            .map_err(|e| e.to_string())??;
        ("127.0.0.1".to_string(), t.local_port, Some(t))
    } else {
        (cfg.host.clone(), cfg.port, None)
    };
    let pw = cfg.password.clone().unwrap_or_default();
    let to = timeout(cfg);
    let conn = match cfg.engine.as_str() {
        "mysql" | "mariadb" => {
            let mut o = MySqlConnectOptions::new().host(&host).port(if port == 0 { 3306 } else { port }).username(&cfg.username).password(&pw);
            if !cfg.database.is_empty() {
                o = o.database(&cfg.database);
            }
            o = o.ssl_mode(if cfg.ssl { MySqlSslMode::Required } else { MySqlSslMode::Preferred });
            let pool = MySqlPoolOptions::new().max_connections(4).acquire_timeout(to).connect_with(o).await.map_err(clean)?;
            Conn::My(pool)
        }
        "postgres" => {
            let mut o = PgConnectOptions::new().host(&host).port(if port == 0 { 5432 } else { port }).username(&cfg.username).password(&pw);
            o = o.database(if cfg.database.is_empty() { "postgres" } else { &cfg.database });
            o = o.ssl_mode(if cfg.ssl { PgSslMode::Require } else { PgSslMode::Prefer });
            let pool = PgPoolOptions::new().max_connections(4).acquire_timeout(to).connect_with(o).await.map_err(clean)?;
            Conn::Pg(pool)
        }
        "sqlite" => {
            let mem = cfg.file_path.trim().is_empty() || cfg.file_path == ":memory:";
            let o = if mem { SqliteConnectOptions::new().filename(":memory:") } else { SqliteConnectOptions::new().filename(&cfg.file_path).create_if_missing(true) };
            let pool = SqlitePoolOptions::new().max_connections(1).acquire_timeout(to).connect_with(o).await.map_err(clean)?;
            Conn::Lite(pool)
        }
        "mssql" => {
            let mut c = tiberius::Config::new();
            c.host(&host);
            c.port(if port == 0 { 1433 } else { port });
            c.authentication(tiberius::AuthMethod::sql_server(&cfg.username, &pw));
            if !cfg.database.is_empty() {
                c.database(&cfg.database);
            }
            if cfg.ssl {
                c.encryption(tiberius::EncryptionLevel::Required);
            } else {
                c.encryption(tiberius::EncryptionLevel::NotSupported);
            }
            c.trust_cert();
            let tcp = tokio::time::timeout(to, tokio::net::TcpStream::connect(c.get_addr())).await.map_err(|_| "Connection timed out".to_string())?.map_err(|e| e.to_string())?;
            tcp.set_nodelay(true).ok();
            let client = tiberius::Client::connect(c, tcp.compat_write()).await.map_err(|e| e.to_string())?;
            Conn::Ms(Arc::new(Mutex::new(client)))
        }
        other => return Err(format!("Unsupported database engine: {other}")),
    };
    Ok((conn, tunnel))
}

/// Strip noisy driver prefixes so the user sees the server's actual message.
fn clean(e: sqlx::Error) -> String {
    match e {
        sqlx::Error::Database(d) => d.message().to_string(),
        sqlx::Error::PoolTimedOut => "Connection timed out".to_string(),
        other => other.to_string(),
    }
}

fn hex(b: &[u8]) -> String {
    let mut s = String::from("0x");
    for x in b.iter().take(64) {
        s.push_str(&format!("{x:02x}"));
    }
    if b.len() > 64 {
        s.push('…');
    }
    s
}

fn typed(type_name: &str, s: String) -> Value {
    let t = type_name.to_ascii_uppercase();
    let int = ["TINYINT", "SMALLINT", "MEDIUMINT", "INT", "BIGINT", "INT2", "INT4", "INT8", "INTEGER", "BOOLEAN", "YEAR"].iter().any(|k| t.starts_with(k));
    if int {
        if let Ok(n) = s.parse::<i64>() {
            return json!(n);
        }
    }
    if ["FLOAT", "DOUBLE", "FLOAT4", "FLOAT8", "REAL"].iter().any(|k| t.starts_with(k)) {
        if let Ok(n) = s.parse::<f64>() {
            if n.is_finite() {
                return json!(n);
            }
        }
    }
    if t == "BOOL" {
        return json!(s == "t" || s == "true" || s == "1");
    }
    Value::String(s)
}

fn my_row(row: &sqlx::mysql::MySqlRow) -> Vec<Value> {
    (0..row.len())
        .map(|i| {
            if row.try_get_raw(i).map(|v| v.is_null()).unwrap_or(true) {
                return Value::Null;
            }
            let tn = row.column(i).type_info().name().to_string();
            match row.try_get_unchecked::<String, _>(i) {
                Ok(s) => typed(&tn, s),
                Err(_) => row.try_get_unchecked::<Vec<u8>, _>(i).map(|b| Value::String(hex(&b))).unwrap_or(Value::Null),
            }
        })
        .collect()
}

fn pg_row(row: &sqlx::postgres::PgRow) -> Vec<Value> {
    (0..row.len())
        .map(|i| {
            if row.try_get_raw(i).map(|v| v.is_null()).unwrap_or(true) {
                return Value::Null;
            }
            let tn = row.column(i).type_info().name().to_string();
            match row.try_get_unchecked::<String, _>(i) {
                Ok(s) => typed(&tn, s),
                Err(_) => row.try_get_unchecked::<Vec<u8>, _>(i).map(|b| Value::String(hex(&b))).unwrap_or(Value::Null),
            }
        })
        .collect()
}

fn lite_row(row: &sqlx::sqlite::SqliteRow) -> Vec<Value> {
    (0..row.len())
        .map(|i| {
            let raw = match row.try_get_raw(i) {
                Ok(r) => r,
                Err(_) => return Value::Null,
            };
            if raw.is_null() {
                return Value::Null;
            }
            let tn = raw.type_info().name().to_string();
            match tn.as_str() {
                "INTEGER" => row.try_get_unchecked::<i64, _>(i).map(|n| json!(n)).unwrap_or(Value::Null),
                "REAL" => row.try_get_unchecked::<f64, _>(i).map(|n| json!(n)).unwrap_or(Value::Null),
                "BLOB" => row.try_get_unchecked::<Vec<u8>, _>(i).map(|b| Value::String(hex(&b))).unwrap_or(Value::Null),
                _ => row.try_get_unchecked::<String, _>(i).map(Value::String).unwrap_or(Value::Null),
            }
        })
        .collect()
}

fn ms_value(d: &tiberius::ColumnData<'_>) -> Value {
    use tiberius::ColumnData as C;
    match d {
        C::U8(v) => v.map(|x| json!(x)).unwrap_or(Value::Null),
        C::I16(v) => v.map(|x| json!(x)).unwrap_or(Value::Null),
        C::I32(v) => v.map(|x| json!(x)).unwrap_or(Value::Null),
        C::I64(v) => v.map(|x| json!(x)).unwrap_or(Value::Null),
        C::F32(v) => v.map(|x| json!(x)).unwrap_or(Value::Null),
        C::F64(v) => v.map(|x| json!(x)).unwrap_or(Value::Null),
        C::Bit(v) => v.map(|x| json!(x)).unwrap_or(Value::Null),
        C::String(v) => v.as_ref().map(|x| json!(x.to_string())).unwrap_or(Value::Null),
        C::Guid(v) => v.map(|x| json!(x.to_string())).unwrap_or(Value::Null),
        C::Binary(v) => v.as_ref().map(|b| Value::String(hex(b))).unwrap_or(Value::Null),
        C::Numeric(v) => v.map(|x| json!(x.to_string())).unwrap_or(Value::Null),
        C::Xml(v) => v.as_ref().map(|x| json!(x.to_string())).unwrap_or(Value::Null),
        other => Value::String(format!("{other:?}")),
    }
}

fn is_row_returning(sql: &str) -> bool {
    let w = sql.trim_start().trim_start_matches('(').split_whitespace().next().unwrap_or("").to_ascii_uppercase();
    matches!(w.as_str(), "SELECT" | "WITH" | "SHOW" | "DESCRIBE" | "DESC" | "EXPLAIN" | "PRAGMA" | "VALUES" | "EXEC" | "EXECUTE" | "TABLE")
}

async fn run(conn: Conn, sql: String, max_rows: usize) -> Result<QueryResult, String> {
    let t0 = Instant::now();
    let mut rows: Vec<Vec<Value>> = Vec::new();
    let mut columns: Vec<String> = Vec::new();
    let mut affected = 0u64;
    let mut truncated = false;

    macro_rules! stream_sqlx {
        ($pool:expr, $conv:ident) => {{
            let mut st = sqlx::raw_sql(&sql).fetch_many(&$pool);
            while let Some(item) = st.try_next().await.map_err(clean)? {
                match item {
                    sqlx::Either::Left(r) => affected += r.rows_affected(),
                    sqlx::Either::Right(row) => {
                        if columns.is_empty() {
                            columns = row.columns().iter().map(|c| c.name().to_string()).collect();
                        }
                        if rows.len() >= max_rows {
                            truncated = true;
                            break;
                        }
                        rows.push($conv(&row));
                    }
                }
            }
            drop(st);
            if rows.is_empty() && columns.is_empty() && is_row_returning(&sql) {
                if let Ok(d) = (&$pool).describe(&sql).await {
                    columns = d.columns().iter().map(|c| c.name().to_string()).collect();
                }
            }
        }};
    }

    match &conn {
        Conn::My(p) => stream_sqlx!(p, my_row),
        Conn::Pg(p) => stream_sqlx!(p, pg_row),
        Conn::Lite(p) => stream_sqlx!(p, lite_row),
        Conn::Ms(c) => {
            let mut client = c.lock().await;
            if is_row_returning(&sql) {
                let mut stream = client.simple_query(sql.as_str()).await.map_err(|e| e.to_string())?;
                while let Some(item) = stream.next().await {
                    match item.map_err(|e| e.to_string())? {
                        tiberius::QueryItem::Metadata(m) => {
                            if columns.is_empty() {
                                columns = m.columns().iter().map(|c| c.name().to_string()).collect();
                            }
                        }
                        tiberius::QueryItem::Row(r) => {
                            if rows.len() >= max_rows {
                                truncated = true;
                                break;
                            }
                            rows.push(r.cells().map(|(_, d)| ms_value(d)).collect());
                        }
                    }
                }
            } else {
                let r = client.execute(sql.as_str(), &[]).await.map_err(|e| e.to_string())?;
                affected = r.total();
            }
        }
    }
    Ok(QueryResult { columns, rows, affected, elapsed_ms: (t0.elapsed().as_secs_f64() * 1000.0 * 100.0).round() / 100.0, truncated })
}

async fn version(conn: &Conn) -> Option<String> {
    let sql = match conn {
        Conn::My(_) => "SELECT VERSION()",
        Conn::Pg(_) => "SHOW server_version",
        Conn::Lite(_) => "SELECT sqlite_version()",
        Conn::Ms(_) => "SELECT @@VERSION",
    };
    let r = run(conn.clone(), sql.to_string(), 1).await.ok()?;
    r.rows.first()?.first()?.as_str().map(|s| s.lines().next().unwrap_or(s).to_string())
}

#[tauri::command]
pub async fn db_test(cfg: Cfg) -> Result<TestResult, String> {
    match open(&cfg).await {
        Ok((conn, _tunnel)) => {
            let v = version(&conn).await;
            Ok(TestResult { ok: true, message: "Connection successful".into(), server_version: v })
        }
        Err(e) => Ok(TestResult { ok: false, message: e, server_version: None }),
    }
}

#[tauri::command]
pub async fn db_connect(cfg: Cfg, sessions: State<'_, Sessions>) -> Result<String, String> {
    let (conn, tunnel) = open(&cfg).await?;
    let id = uuid::Uuid::new_v4().to_string();
    sessions.0.lock().await.insert(id.clone(), Session { conn, _tunnel: tunnel, abort: None });
    Ok(id)
}

#[tauri::command]
pub async fn db_disconnect(session: String, sessions: State<'_, Sessions>) -> Result<(), String> {
    if let Some(s) = sessions.0.lock().await.remove(&session) {
        match s.conn {
            Conn::My(p) => p.close().await,
            Conn::Pg(p) => p.close().await,
            Conn::Lite(p) => p.close().await,
            Conn::Ms(_) => {}
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn db_query(session: String, sql: String, max_rows: Option<usize>, sessions: State<'_, Sessions>) -> Result<QueryResult, String> {
    let conn = sessions.0.lock().await.get(&session).map(|s| s.conn.clone()).ok_or("Session closed. Reconnect and try again.")?;
    let handle = tokio::spawn(run(conn, sql, max_rows.unwrap_or(1000).clamp(1, 200_000)));
    if let Some(s) = sessions.0.lock().await.get_mut(&session) {
        s.abort = Some(handle.abort_handle());
    }
    let out = handle.await;
    if let Some(s) = sessions.0.lock().await.get_mut(&session) {
        s.abort = None;
    }
    match out {
        Ok(r) => r,
        Err(e) if e.is_cancelled() => Err("Query cancelled".into()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn db_cancel(session: String, sessions: State<'_, Sessions>) -> Result<(), String> {
    if let Some(s) = sessions.0.lock().await.get(&session) {
        if let Some(a) = &s.abort {
            a.abort();
        }
    }
    Ok(())
}

/// All statements run in ONE transaction; the first error rolls everything back.
#[tauri::command]
pub async fn db_transaction(session: String, statements: Vec<String>, sessions: State<'_, Sessions>) -> Result<Value, String> {
    let conn = sessions.0.lock().await.get(&session).map(|s| s.conn.clone()).ok_or("Session closed. Reconnect and try again.")?;
    let mut affected = 0u64;
    macro_rules! tx {
        ($pool:expr) => {{
            let mut tx = $pool.begin().await.map_err(clean)?;
            for s in &statements {
                match sqlx::raw_sql(s).execute(&mut *tx).await {
                    Ok(r) => affected += r.rows_affected(),
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return Err(format!("{} (transaction rolled back)", clean(e)));
                    }
                }
            }
            tx.commit().await.map_err(clean)?;
        }};
    }
    match &conn {
        Conn::My(p) => tx!(p),
        Conn::Pg(p) => tx!(p),
        Conn::Lite(p) => tx!(p),
        Conn::Ms(c) => {
            let mut cl = c.lock().await;
            cl.simple_query("BEGIN TRANSACTION").await.map_err(|e| e.to_string())?.into_results().await.map_err(|e| e.to_string())?;
            for s in &statements {
                match cl.execute(s.as_str(), &[]).await {
                    Ok(r) => affected += r.total(),
                    Err(e) => {
                        let _ = cl.simple_query("ROLLBACK TRANSACTION").await;
                        return Err(format!("{e} (transaction rolled back)"));
                    }
                }
            }
            cl.simple_query("COMMIT TRANSACTION").await.map_err(|e| e.to_string())?.into_results().await.map_err(|e| e.to_string())?;
        }
    }
    Ok(json!({ "affected": affected }))
}
