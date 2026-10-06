import { splitStatements } from './sqlSafety'

// Keep quoted identifiers (`x`, "x") but drop comments and single-quoted strings. Ambiguous input makes us refuse, never guess.
const COMMENTS = /--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g
const SINGLE_QUOTED = /'(?:[^'\\]|\\.|'')*'/g
const strip = (s: string) => s.replace(COMMENTS, ' ').replace(SINGLE_QUOTED, "''")

export interface SourceTable { table: string; ns?: string }

const AGG = /\b(COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT|STRING_AGG|ARRAY_AGG)\s*\(/i

/**
 * If `sql` is a plain single-table SELECT (no join, grouping, aggregates, DISTINCT, set operations or subqueries),
 * returns that table. Anything else is not safe to edit through, so returns null.
 */
export function singleTableOf(sql: string): SourceTable | null {
  const parts = splitStatements(sql)
  if (parts.length !== 1) return null
  const t = strip(parts[0].text).replace(/\s+/g, ' ').trim()
  const m = /^SELECT\s+(.+?)\s+FROM\s+(?:`?([\w$]+)`?\.)?`?([\w$]+)`?(?:\s+(?:AS\s+)?([\w$]+))?\s*(.*)$/i.exec(t)
  if (!m) return null
  const [, list, ns, table, alias, rest] = m
  if (/^DISTINCT\b/i.test(list) || AGG.test(list) || /\(\s*SELECT\b/i.test(list)) return null
  const tail = (alias && /^(WHERE|ORDER|LIMIT|GROUP|HAVING|JOIN|LEFT|RIGHT|INNER|CROSS|UNION|OFFSET|FETCH)$/i.test(alias) ? `${alias} ${rest}` : rest).trim()
  if (/^(,|JOIN\b|LEFT\b|RIGHT\b|INNER\b|CROSS\b|NATURAL\b|FULL\b|STRAIGHT_JOIN\b)/i.test(tail)) return null
  if (/\b(GROUP\s+BY|HAVING|UNION|INTERSECT|EXCEPT|JOIN)\b/i.test(tail) || /\(\s*SELECT\b/i.test(tail)) return null
  return { table, ns: ns || undefined }
}
