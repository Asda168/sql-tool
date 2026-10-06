export type EngineId = 'mysql' | 'mariadb' | 'postgres' | 'sqlite' | 'mssql'
export type Environment = 'local' | 'development' | 'staging' | 'production'

export interface EngineInfo {
  id: EngineId
  label: string
  defaultPort: number
  defaultUser: string
  fileBased: boolean
  /** sql-formatter dialect */
  dialect: 'mysql' | 'mariadb' | 'postgresql' | 'sqlite' | 'transactsql'
  /** label for the top-level namespace in the explorer */
  namespace: 'Database' | 'Schema'
  supportsRoutines: boolean
  supportsEvents: boolean
  supportsTriggers: boolean
  explain: string
  systemDatabases: string[]
}

export const ENGINES: Record<EngineId, EngineInfo> = {
  mysql: { id: 'mysql', label: 'MySQL', defaultPort: 3306, defaultUser: 'root', fileBased: false, dialect: 'mysql', namespace: 'Database', supportsRoutines: true, supportsEvents: true, supportsTriggers: true, explain: 'EXPLAIN ', systemDatabases: ['information_schema', 'mysql', 'performance_schema', 'sys'] },
  mariadb: { id: 'mariadb', label: 'MariaDB', defaultPort: 3306, defaultUser: 'root', fileBased: false, dialect: 'mariadb', namespace: 'Database', supportsRoutines: true, supportsEvents: true, supportsTriggers: true, explain: 'EXPLAIN ', systemDatabases: ['information_schema', 'mysql', 'performance_schema', 'sys'] },
  postgres: { id: 'postgres', label: 'PostgreSQL', defaultPort: 5432, defaultUser: 'postgres', fileBased: false, dialect: 'postgresql', namespace: 'Schema', supportsRoutines: true, supportsEvents: false, supportsTriggers: true, explain: 'EXPLAIN ', systemDatabases: ['information_schema', 'pg_catalog', 'pg_toast'] },
  sqlite: { id: 'sqlite', label: 'SQLite', defaultPort: 0, defaultUser: '', fileBased: true, dialect: 'sqlite', namespace: 'Database', supportsRoutines: false, supportsEvents: false, supportsTriggers: true, explain: 'EXPLAIN QUERY PLAN ', systemDatabases: [] },
  mssql: { id: 'mssql', label: 'SQL Server', defaultPort: 1433, defaultUser: 'sa', fileBased: false, dialect: 'transactsql', namespace: 'Database', supportsRoutines: true, supportsEvents: false, supportsTriggers: true, explain: 'SET SHOWPLAN_TEXT ON;\n', systemDatabases: ['master', 'model', 'msdb', 'tempdb'] },
}
export const ENGINE_LIST = Object.values(ENGINES)

export const ENVIRONMENTS: Record<Environment, { label: string; badge: string; cls: string }> = {
  local: { label: 'LOCAL', badge: '●', cls: 'text-ok border-ok/50' },
  development: { label: 'DEV', badge: '◆', cls: 'text-accent border-accent/50' },
  staging: { label: 'STAGING', badge: '▲', cls: 'text-warn border-warn/50' },
  production: { label: 'PRODUCTION', badge: '■', cls: 'text-danger border-danger/60 bg-danger/10' },
}

export function quoteIdent(engine: EngineId, name: string): string {
  switch (engine) {
    case 'mysql':
    case 'mariadb':
      return '`' + name.replace(/`/g, '``') + '`'
    case 'mssql':
      return '[' + name.replace(/]/g, ']]') + ']'
    default:
      return '"' + name.replace(/"/g, '""') + '"'
  }
}

export function qualified(engine: EngineId, ns: string | undefined, table: string): string {
  const useNs = ns && engine !== 'sqlite'
  return (useNs ? quoteIdent(engine, ns!) + '.' : '') + quoteIdent(engine, table)
}

export function sqlLiteral(engine: EngineId, v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'boolean') return engine === 'postgres' ? (v ? 'TRUE' : 'FALSE') : v ? '1' : '0'
  let s = String(v).replace(/'/g, "''")
  if (engine === 'mysql' || engine === 'mariadb') s = s.replace(/\\/g, '\\\\')
  return (engine === 'mssql' ? 'N' : '') + "'" + s + "'"
}

/** SQL for one page of a table. */
export function pageSql(engine: EngineId, table: string, limit: number, offset: number, where = '', order = ''): string {
  const base = `SELECT * FROM ${table}${where ? ' WHERE ' + where : ''}`
  if (engine === 'mssql') return `${base} ORDER BY ${order || '(SELECT NULL)'} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
  return `${base}${order ? ' ORDER BY ' + order : ''} LIMIT ${limit} OFFSET ${offset}`
}
