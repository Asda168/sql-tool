import { type EngineId, quoteIdent as q } from './engines'

export interface DesignColumn {
  name: string; type: string; length: string; nullable: boolean
  primaryKey: boolean; autoIncrement: boolean; unique: boolean; default: string
}
export interface DesignIndex { name: string; columns: string[]; unique: boolean }
export interface DesignFk { name: string; column: string; refTable: string; refColumn: string; onDelete: string }
export interface TableDesign { name: string; columns: DesignColumn[]; indexes: DesignIndex[]; foreignKeys: DesignFk[] }

export const COLUMN_TYPES: Record<EngineId, string[]> = {
  mysql: ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'BOOLEAN', 'JSON', 'BLOB', 'ENUM'],
  mariadb: ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'BOOLEAN', 'JSON', 'BLOB', 'UUID'],
  postgres: ['INT', 'BIGINT', 'SMALLINT', 'NUMERIC', 'REAL', 'DOUBLE PRECISION', 'VARCHAR', 'CHAR', 'TEXT', 'DATE', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIME', 'BOOLEAN', 'JSONB', 'UUID', 'BYTEA'],
  sqlite: ['INTEGER', 'REAL', 'TEXT', 'BLOB', 'NUMERIC', 'VARCHAR', 'DATETIME', 'BOOLEAN'],
  mssql: ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'FLOAT', 'NVARCHAR', 'VARCHAR', 'CHAR', 'NTEXT', 'DATE', 'DATETIME2', 'TIME', 'BIT', 'UNIQUEIDENTIFIER', 'VARBINARY'],
}

const NEEDS_LENGTH = /^(VARCHAR|CHAR|NVARCHAR|DECIMAL|NUMERIC|VARBINARY)$/i
const KEYWORD_DEFAULT = /^(CURRENT_TIMESTAMP|NULL|TRUE|FALSE|NOW\(\)|GETDATE\(\)|\(.*\)|-?\d+(\.\d+)?)$/i

export function columnSql(e: EngineId, c: DesignColumn): string {
  let type = c.type.toUpperCase()
  if (c.length && NEEDS_LENGTH.test(type)) type += `(${c.length})`
  const my = e === 'mysql' || e === 'mariadb'
  if (e === 'sqlite' && c.primaryKey && c.autoIncrement) return `${q(e, c.name)} INTEGER PRIMARY KEY AUTOINCREMENT`
  if (e === 'postgres' && c.autoIncrement) type = type === 'BIGINT' ? 'BIGSERIAL' : 'SERIAL'
  const parts = [q(e, c.name), type]
  parts.push(c.nullable && !c.primaryKey ? 'NULL' : 'NOT NULL')
  if (c.autoIncrement) {
    if (my) parts.push('AUTO_INCREMENT')
    else if (e === 'mssql') parts.push('IDENTITY(1,1)')
  }
  if (c.default.trim() !== '' && !c.autoIncrement) {
    const d = c.default.trim()
    parts.push('DEFAULT ' + (KEYWORD_DEFAULT.test(d) ? d : `'${d.replace(/'/g, "''")}'`))
  }
  return parts.join(' ')
}

export function generateCreateTable(e: EngineId, t: TableDesign): string {
  const lines: string[] = []
  const sqliteInlinePk = e === 'sqlite' && t.columns.some((c) => c.primaryKey && c.autoIncrement)
  t.columns.forEach((c) => lines.push(columnSql(e, c)))
  const pks = t.columns.filter((c) => c.primaryKey).map((c) => q(e, c.name))
  if (pks.length && !sqliteInlinePk) lines.push(`PRIMARY KEY (${pks.join(', ')})`)
  t.columns.filter((c) => c.unique && !c.primaryKey).forEach((c) => lines.push(`UNIQUE (${q(e, c.name)})`))
  t.foreignKeys.forEach((f) =>
    lines.push(`CONSTRAINT ${q(e, f.name || `fk_${t.name}_${f.column}`)} FOREIGN KEY (${q(e, f.column)}) REFERENCES ${q(e, f.refTable)} (${q(e, f.refColumn)})${f.onDelete ? ' ON DELETE ' + f.onDelete : ''}`),
  )
  const body = lines.map((l) => '    ' + l).join(',\n')
  const out = [`CREATE TABLE ${q(e, t.name)} (\n${body}\n);`]
  t.indexes.filter((i) => i.columns.length).forEach((i) =>
    out.push(`CREATE ${i.unique ? 'UNIQUE ' : ''}INDEX ${q(e, i.name || `idx_${t.name}_${i.columns.join('_')}`)} ON ${q(e, t.name)} (${i.columns.map((c) => q(e, c)).join(', ')});`),
  )
  return out.join('\n')
}

export const blankColumn = (): DesignColumn => ({ name: '', type: 'VARCHAR', length: '255', nullable: true, primaryKey: false, autoIncrement: false, unique: false, default: '' })

const typeOf = (c: DesignColumn) => c.type.toUpperCase() + (c.length && NEEDS_LENGTH.test(c.type) ? `(${c.length})` : '')
const defaultSql = (d: string) => (KEYWORD_DEFAULT.test(d.trim()) ? d.trim() : `'${d.trim().replace(/'/g, "''")}'`)

export const alterAddColumn = (e: EngineId, table: string, c: DesignColumn) => `ALTER TABLE ${table} ADD ${e === 'mssql' ? '' : 'COLUMN '}${columnSql(e, c)}`
export const alterDropColumn = (e: EngineId, table: string, name: string) => `ALTER TABLE ${table} DROP COLUMN ${q(e, name)}`

/** Statements that change an existing column (rename + type + nullability + default). SQLite cannot do this in place. */
export function alterModifyColumn(e: EngineId, table: string, oldName: string, c: DesignColumn): string[] {
  if (e === 'sqlite') throw new Error('SQLite cannot alter columns in place. Recreate the table instead.')
  if (e === 'mysql' || e === 'mariadb') return [`ALTER TABLE ${table} CHANGE COLUMN ${q(e, oldName)} ${columnSql(e, c)}`]
  const out: string[] = []
  if (e === 'postgres') {
    if (oldName !== c.name) out.push(`ALTER TABLE ${table} RENAME COLUMN ${q(e, oldName)} TO ${q(e, c.name)}`)
    out.push(`ALTER TABLE ${table} ALTER COLUMN ${q(e, c.name)} TYPE ${typeOf(c)}`)
    out.push(`ALTER TABLE ${table} ALTER COLUMN ${q(e, c.name)} ${c.nullable ? 'DROP' : 'SET'} NOT NULL`)
    out.push(c.default.trim() ? `ALTER TABLE ${table} ALTER COLUMN ${q(e, c.name)} SET DEFAULT ${defaultSql(c.default)}` : `ALTER TABLE ${table} ALTER COLUMN ${q(e, c.name)} DROP DEFAULT`)
    return out
  }
  if (oldName !== c.name) out.push(`EXEC sp_rename '${table.replace(/[\[\]]/g, '').replace(/'/g, "''")}.${oldName.replace(/'/g, "''")}', '${c.name.replace(/'/g, "''")}', 'COLUMN'`)
  out.push(`ALTER TABLE ${table} ALTER COLUMN ${q(e, c.name)} ${typeOf(c)} ${c.nullable ? 'NULL' : 'NOT NULL'}`)
  return out
}
