import type { Bridge } from '../bridge/types'
import { type EngineId, ENGINES, qualified, sqlLiteral } from './engines'

/** Engine-aware schema introspection built on bridge.db.query, so each engine needs no native special-casing. */

export interface TableRef { name: string; kind: 'table' | 'view'; comment: string }
export interface ColumnInfo { name: string; type: string; nullable: boolean; key: string; default: string | null; extra: string; comment: string }
export interface IndexInfo { name: string; unique: boolean; columns: string[] }
export interface FkInfo { name: string; column: string; refTable: string; refColumn: string }
export interface NamedObject { name: string; detail: string }
export interface TableDetails { columns: ColumnInfo[]; indexes: IndexInfo[]; foreignKeys: FkInfo[] }

const L = (e: EngineId, v: string) => sqlLiteral(e, v)
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export class Introspector {
  constructor(private bridge: Bridge, private session: string, private engine: EngineId) {}

  private async q(sql: string) {
    return (await this.bridge.db.query(this.session, sql, { maxRows: 20000 })).rows
  }

  async namespaces(): Promise<string[]> {
    const e = this.engine
    if (e === 'sqlite') return ['main']
    if (e === 'postgres') return (await this.q('SELECT schema_name FROM information_schema.schemata ORDER BY 1')).map((r) => s(r[0]))
    if (e === 'mssql') return (await this.q('SELECT name FROM sys.databases ORDER BY name')).map((r) => s(r[0]))
    return (await this.q('SHOW DATABASES')).map((r) => s(r[0]))
  }

  async tables(ns: string): Promise<TableRef[]> {
    const e = this.engine
    if (e === 'sqlite') {
      return (await this.q("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => ({ name: s(r[0]), kind: r[1] === 'view' ? 'view' : 'table', comment: '' }))
    }
    if (e === 'mssql') {
      return (await this.q(`SELECT TABLE_NAME, TABLE_TYPE FROM [${ns}].INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME`)).map((r) => ({ name: s(r[0]), kind: /VIEW/.test(s(r[1])) ? 'view' : 'table', comment: '' }))
    }
    const comment = e === 'postgres' ? "''" : 'table_comment'
    return (await this.q(`SELECT table_name, table_type, ${comment} FROM information_schema.tables WHERE table_schema = ${L(e, ns)} ORDER BY table_name`)).map((r) => ({
      name: s(r[0]), kind: /VIEW/.test(s(r[1])) ? 'view' : 'table', comment: s(r[2]),
    }))
  }

  /** All columns of a namespace in one query: powers autocomplete and ERD without N round trips. */
  async allColumns(ns: string): Promise<Record<string, string[]>> {
    const e = this.engine
    const out: Record<string, string[]> = {}
    if (e === 'sqlite') {
      for (const t of await this.tables(ns)) out[t.name] = (await this.q(`PRAGMA table_info(${L(e, t.name)})`)).map((r) => s(r[1]))
      return out
    }
    const sql = e === 'mssql'
      ? `SELECT TABLE_NAME, COLUMN_NAME FROM [${ns}].INFORMATION_SCHEMA.COLUMNS ORDER BY TABLE_NAME, ORDINAL_POSITION`
      : `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ${L(e, ns)} ORDER BY table_name, ordinal_position`
    for (const r of await this.q(sql)) (out[s(r[0])] ||= []).push(s(r[1]))
    return out
  }

  async details(ns: string, table: string): Promise<TableDetails> {
    const e = this.engine
    if (e === 'sqlite') return this.sqliteDetails(table)
    if (e === 'mssql') return this.mssqlDetails(ns, table)
    const t = L(e, table), n = L(e, ns)
    const pg = e === 'postgres'
    const cols = await this.q(
      pg
        ? `SELECT c.column_name, c.data_type || COALESCE('(' || c.character_maximum_length || ')', ''), c.is_nullable, '', c.column_default, '', COALESCE(col_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass::oid, c.ordinal_position), '') FROM information_schema.columns c WHERE c.table_schema = ${n} AND c.table_name = ${t} ORDER BY c.ordinal_position`
        : `SELECT column_name, column_type, is_nullable, column_key, column_default, extra, column_comment FROM information_schema.columns WHERE table_schema = ${n} AND table_name = ${t} ORDER BY ordinal_position`,
    )
    const pk = pg
      ? await this.q(`SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = ${n} AND tc.table_name = ${t}`)
      : []
    const pkSet = new Set(pk.map((r) => s(r[0])))
    const columns: ColumnInfo[] = cols.map((r) => ({
      name: s(r[0]), type: s(r[1]), nullable: s(r[2]).toUpperCase() === 'YES',
      key: pg ? (pkSet.has(s(r[0])) ? 'PRI' : '') : s(r[3]), default: r[4] === null ? null : s(r[4]), extra: s(r[5]), comment: s(r[6]),
    }))
    const idxRows = await this.q(
      pg
        ? `SELECT i.relname, ix.indisunique, a.attname FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_class t ON t.oid = ix.indrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) WHERE ns.nspname = ${n} AND t.relname = ${t} ORDER BY i.relname`
        : `SELECT index_name, non_unique = 0, column_name FROM information_schema.statistics WHERE table_schema = ${n} AND table_name = ${t} ORDER BY index_name, seq_in_index`,
    )
    const idx = new Map<string, IndexInfo>()
    for (const r of idxRows) {
      const k = s(r[0])
      const i = idx.get(k) ?? { name: k, unique: r[1] === true || r[1] === 1 || r[1] === '1' || r[1] === 't', columns: [] }
      i.columns.push(s(r[2]))
      idx.set(k, i)
    }
    const fkRows = await this.q(
      pg
        ? `SELECT tc.constraint_name, kcu.column_name, ccu.table_name, ccu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = ${n} AND tc.table_name = ${t}`
        : `SELECT constraint_name, column_name, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage WHERE table_schema = ${n} AND table_name = ${t} AND referenced_table_name IS NOT NULL`,
    )
    return {
      columns, indexes: [...idx.values()],
      foreignKeys: fkRows.map((r) => ({ name: s(r[0]), column: s(r[1]), refTable: s(r[2]), refColumn: s(r[3]) })),
    }
  }

  private async sqliteDetails(table: string): Promise<TableDetails> {
    const e = this.engine
    const cols = await this.q(`PRAGMA table_info(${L(e, table)})`)
    const columns: ColumnInfo[] = cols.map((r) => ({
      name: s(r[1]), type: s(r[2]), nullable: Number(r[3]) === 0 && Number(r[5]) === 0, key: Number(r[5]) > 0 ? 'PRI' : '',
      default: r[4] === null ? null : s(r[4]), extra: '', comment: '',
    }))
    const indexes: IndexInfo[] = []
    for (const r of await this.q(`PRAGMA index_list(${L(e, table)})`)) {
      const info = await this.q(`PRAGMA index_info(${L(e, s(r[1]))})`)
      indexes.push({ name: s(r[1]), unique: Number(r[2]) === 1, columns: info.map((x) => s(x[2])) })
    }
    const fks = (await this.q(`PRAGMA foreign_key_list(${L(e, table)})`)).map((r) => ({ name: `fk_${s(r[0])}`, column: s(r[3]), refTable: s(r[2]), refColumn: s(r[4]) }))
    return { columns, indexes, foreignKeys: fks }
  }

  private async mssqlDetails(ns: string, table: string): Promise<TableDetails> {
    const e = this.engine, db = `[${ns}]`, t = L(e, table)
    const cols = await this.q(`SELECT COLUMN_NAME, DATA_TYPE + COALESCE('(' + CAST(CHARACTER_MAXIMUM_LENGTH AS varchar) + ')', ''), IS_NULLABLE, COLUMN_DEFAULT FROM ${db}.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ${t} ORDER BY ORDINAL_POSITION`)
    const pk = await this.q(`SELECT kcu.COLUMN_NAME FROM ${db}.INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc JOIN ${db}.INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = ${t}`)
    const pkSet = new Set(pk.map((r) => s(r[0])))
    return {
      columns: cols.map((r) => ({ name: s(r[0]), type: s(r[1]), nullable: s(r[2]) === 'YES', key: pkSet.has(s(r[0])) ? 'PRI' : '', default: r[3] === null ? null : s(r[3]), extra: '', comment: '' })),
      indexes: [], foreignKeys: [],
    }
  }

  async objects(ns: string, kind: 'procedures' | 'functions' | 'triggers' | 'events'): Promise<NamedObject[]> {
    const e = this.engine, info = ENGINES[e]
    if (kind === 'events' && !info.supportsEvents) return []
    if (kind === 'triggers' && !info.supportsTriggers) return []
    if ((kind === 'procedures' || kind === 'functions') && !info.supportsRoutines) return []
    if (e === 'sqlite') return (await this.q("SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")).map((r) => ({ name: s(r[0]), detail: s(r[1]) }))
    if (e === 'mssql') {
      const type = { procedures: "'P'", functions: "'FN','IF','TF'", triggers: "'TR'", events: "''" }[kind]
      return (await this.q(`SELECT name, type_desc FROM [${ns}].sys.objects WHERE type IN (${type}) ORDER BY name`)).map((r) => ({ name: s(r[0]), detail: s(r[1]) }))
    }
    const n = L(e, ns)
    const sql =
      kind === 'triggers'
        ? `SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE ${e === 'postgres' ? 'trigger_schema' : 'trigger_schema'} = ${n} ORDER BY 1`
        : kind === 'events'
          ? `SELECT event_name, status FROM information_schema.events WHERE event_schema = ${n} ORDER BY 1`
          : `SELECT routine_name, data_type FROM information_schema.routines WHERE routine_schema = ${n} AND routine_type = ${kind === 'procedures' ? "'PROCEDURE'" : "'FUNCTION'"} ORDER BY 1`
    return (await this.q(sql)).map((r) => ({ name: s(r[0]), detail: s(r[1]) }))
  }
}

export { qualified }
