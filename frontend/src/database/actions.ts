import { bridge } from '../bridge'
import { type EngineId, qualified, quoteIdent } from '../lib/engines'
import { generateCreateTable, type TableDesign } from '../lib/codegen'
import type { TableDetails } from '../lib/introspect'
import { Introspector } from '../lib/introspect'
import { useApp } from '../store/app'

export function ctx(connId: string) {
  const st = useApp.getState()
  const cfg = st.connections.find((c) => c.id === connId)
  const sess = st.sessions[connId]
  if (!cfg || !sess) throw new Error('Not connected')
  return { cfg, sess, engine: sess.engine, intro: new Introspector(bridge(), sess.sessionId, sess.engine) }
}

export const renameSql = (e: EngineId, ns: string, from: string, to: string) =>
  e === 'mysql' || e === 'mariadb' ? `RENAME TABLE ${qualified(e, ns, from)} TO ${qualified(e, ns, to)}`
    : e === 'mssql' ? `EXEC sp_rename '${from.replace(/'/g, "''")}', '${to.replace(/'/g, "''")}'`
      : `ALTER TABLE ${qualified(e, ns, from)} RENAME TO ${quoteIdent(e, to)}`

export const duplicateSql = (e: EngineId, ns: string, from: string, to: string): string[] =>
  e === 'mysql' || e === 'mariadb' ? [`CREATE TABLE ${qualified(e, ns, to)} LIKE ${qualified(e, ns, from)}`, `INSERT INTO ${qualified(e, ns, to)} SELECT * FROM ${qualified(e, ns, from)}`]
    : e === 'mssql' ? [`SELECT * INTO ${qualified(e, ns, to)} FROM ${qualified(e, ns, from)}`]
      : [`CREATE TABLE ${qualified(e, ns, to)} AS SELECT * FROM ${qualified(e, ns, from)}`]

export const dropSql = (e: EngineId, ns: string, t: string, view = false) => `DROP ${view ? 'VIEW' : 'TABLE'} ${qualified(e, ns, t)}`

/** Run schema-changing statements after an explicit confirmation (extra warning on production). */
export async function runDdl(connId: string, statements: string[], what: string, danger = true): Promise<boolean> {
  const st = useApp.getState()
  const { cfg, sess } = ctx(connId)
  const ok = await st.confirm({
    title: 'Potentially destructive operation',
    body: `${what}\n\n${statements.join(';\n')};`,
    confirmLabel: 'Execute', danger,
    banner: cfg.environment === 'production' ? 'PRODUCTION DATABASE' : undefined,
  })
  if (!ok) return false
  try {
    await bridge().db.transaction(sess.sessionId, statements)
  } catch {
    // DDL can implicitly commit on some engines; fall back to sequential execution with the real error surfaced
    for (const s of statements) await bridge().db.query(sess.sessionId, s, { maxRows: 1 })
  }
  void st.refreshSchema(connId)
  return true
}

export function designFromDetails(name: string, d: TableDetails): TableDesign {
  return {
    name,
    columns: d.columns.map((c) => {
      const m = /^([A-Za-z ]+?)(?:\(([^)]*)\))?(\s.*)?$/.exec(c.type)
      return {
        name: c.name, type: (m?.[1] ?? c.type).trim().toUpperCase(), length: m?.[2] ?? '', nullable: c.nullable,
        primaryKey: c.key === 'PRI', autoIncrement: /auto_increment|identity/i.test(c.extra), unique: c.key === 'UNI',
        default: c.default ?? '',
      }
    }),
    indexes: d.indexes.filter((i) => i.name !== 'PRIMARY' && !/pkey$|^sqlite_autoindex/.test(i.name)).map((i) => ({ name: i.name, columns: i.columns, unique: i.unique })),
    foreignKeys: d.foreignKeys.map((f) => ({ name: f.name, column: f.column, refTable: f.refTable, refColumn: f.refColumn, onDelete: '' })),
  }
}

export async function generateSql(connId: string, ns: string, table: string, kind: 'select' | 'insert' | 'update' | 'delete' | 'create') {
  const { engine, intro } = ctx(connId)
  const d = await intro.details(ns, table)
  const q = (n: string) => quoteIdent(engine, n)
  const t = qualified(engine, ns, table)
  const cols = d.columns.map((c) => q(c.name))
  const pk = d.columns.find((c) => c.key === 'PRI')?.name ?? d.columns[0]?.name ?? 'id'
  switch (kind) {
    case 'select': {
      const tail = engine === 'mssql' ? 'ORDER BY 1 OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY' : 'LIMIT 100'
      return ['SELECT', '    ' + cols.join(',\n    '), `FROM ${t}`, tail + ';'].join('\n')
    }
    case 'insert': return `INSERT INTO ${t} (${cols.join(', ')})\nVALUES (${cols.map(() => '?').join(', ')});`
    case 'update': return `UPDATE ${t}\nSET ${cols.map((c) => `${c} = ?`).join(',\n    ')}\nWHERE ${q(pk)} = ?;`
    case 'delete': return `DELETE FROM ${t}\nWHERE ${q(pk)} = ?;`
    case 'create': return generateCreateTable(engine, designFromDetails(table, d))
  }
}
