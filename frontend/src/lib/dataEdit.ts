import { type EngineId, qualified, quoteIdent, sqlLiteral } from './engines'

export interface EditPlan {
  engine: EngineId
  ns?: string
  table: string
  columns: string[]
  /** primary-key column names; every UPDATE/DELETE targets exactly one row through them */
  pkCols: string[]
  /** rows as originally loaded (never mutated) */
  rows: unknown[][]
  /** rows at index >= loadedCount are new, unsaved rows */
  loadedCount: number
  edits: Map<number, Map<number, unknown>>
  deleted: Set<number>
}

/** UPDATE / DELETE / INSERT statements for the pending changes. Run them in ONE transaction. */
export function buildStatements(p: EditPlan): string[] {
  const t = qualified(p.engine, p.ns, p.table)
  const q = (n: string) => quoteIdent(p.engine, n)
  const lit = (v: unknown) => sqlLiteral(p.engine, v)
  if (!p.pkCols.length) throw new Error('This table has no primary key, so rows cannot be changed safely.')
  const wherePk = (row: unknown[]) => p.pkCols.map((c) => {
    const i = p.columns.indexOf(c)
    if (i < 0) throw new Error(`The primary key column "${c}" is not part of the result.`)
    return row[i] === null ? `${q(c)} IS NULL` : `${q(c)} = ${lit(row[i])}`
  }).join(' AND ')
  const out: string[] = []
  p.edits.forEach((m, r) => {
    if (p.deleted.has(r) || r >= p.loadedCount) return
    out.push(`UPDATE ${t} SET ${[...m].map(([c, v]) => `${q(p.columns[c])} = ${lit(v)}`).join(', ')} WHERE ${wherePk(p.rows[r])}`)
  })
  p.deleted.forEach((r) => { if (r < p.loadedCount) out.push(`DELETE FROM ${t} WHERE ${wherePk(p.rows[r])}`) })
  p.rows.slice(p.loadedCount).forEach((row) => {
    const use = p.columns.map((_c, i) => i).filter((i) => row[i] !== null && row[i] !== '')
    out.push(use.length ? `INSERT INTO ${t} (${use.map((i) => q(p.columns[i])).join(', ')}) VALUES (${use.map((i) => lit(row[i])).join(', ')})` : `INSERT INTO ${t} DEFAULT VALUES`)
  })
  return out
}
