/** Pure helpers behind SQL autocomplete: ranking, clause detection, and table/alias extraction. */

/** Higher is better; -1 means "does not match". Prefix > word-start > substring > subsequence. */
export function fuzzyScore(query: string, candidate: string): number {
  const q = query.toLowerCase(), c = candidate.toLowerCase()
  if (!q) return 1
  if (c === q) return 1000
  if (c.startsWith(q)) return 900 - Math.min(99, c.length - q.length)
  // word-start match: after '_' , '-' , '.' or a lower->upper camel boundary (e.g. "ac" in user_account / userAccount)
  const wordStarts: number[] = []
  for (let i = 0; i < candidate.length; i++) {
    if (i === 0 || /[_\-. ]/.test(candidate[i - 1]) || (/[a-z]/.test(candidate[i - 1]) && /[A-Z]/.test(candidate[i]))) wordStarts.push(i)
  }
  for (const i of wordStarts) if (c.startsWith(q, i)) return 700 - Math.min(99, i)
  const at = c.indexOf(q)
  if (at >= 0) return 500 - Math.min(99, at)
  // subsequence ("uacc" matches user_account); reward tight matches
  let ci = 0, last = -2, bonus = 0
  for (const ch of q) {
    const f = c.indexOf(ch, ci)
    if (f < 0) return -1
    if (f === last + 1) bonus += 8
    if (wordStarts.includes(f)) bonus += 12
    last = f; ci = f + 1
  }
  return 200 + bonus - Math.min(100, c.length)
}

export type Clause = 'start' | 'select' | 'from' | 'join' | 'on' | 'where' | 'groupby' | 'orderby' | 'having' | 'set' | 'values' | 'into' | 'update' | 'limit' | 'table' | 'other'

const STRINGS = /'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"|`[^`]*`/g
const COMMENTS = /--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g
export const stripNoise = (s: string) => s.replace(COMMENTS, ' ').replace(STRINGS, "''")

const KW = /\b(SELECT|FROM|JOIN|ON|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|SET|VALUES|INTO|UPDATE|LIMIT|USING|UNION|DELETE|INSERT|CREATE|ALTER|DROP|TRUNCATE|DESCRIBE|TABLE)\b/gi
const MAP: Record<string, Clause> = {
  SELECT: 'select', FROM: 'from', JOIN: 'join', ON: 'on', WHERE: 'where', 'GROUP BY': 'groupby', 'ORDER BY': 'orderby', HAVING: 'having', SET: 'set',
  VALUES: 'values', INTO: 'into', UPDATE: 'update', LIMIT: 'limit', USING: 'on', UNION: 'start', DELETE: 'other', INSERT: 'other', CREATE: 'other', ALTER: 'other', DROP: 'other', TRUNCATE: 'other', DESCRIBE: 'table', TABLE: 'table',
}

/** Which clause the cursor is in, from the text of the current statement before the cursor. */
export function clauseAt(before: string): Clause {
  const t = stripNoise(before)
  if (!t.trim() || /;\s*$/.test(t)) return 'start'
  let last: Clause | null = null
  let m: RegExpExecArray | null
  KW.lastIndex = 0
  while ((m = KW.exec(t))) last = MAP[m[1].toUpperCase().replace(/\s+/g, ' ')] ?? 'other'
  // DELETE FROM x: "FROM" after DELETE still wants a table, which 'from' already handles
  return last ?? 'start'
}

/** True when the cursor sits after a complete table reference, e.g. "FROM users u |" (next comes a keyword, not a table). */
const RESERVED = new Set(['WHERE', 'ON', 'SET', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'JOIN', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'UNION', 'VALUES', 'USING', 'SELECT', 'AND', 'OR', 'NATURAL', 'STRAIGHT_JOIN'])

export function afterTableRef(before: string): boolean {
  const t = stripNoise(before)
  // the optional alias must not be a keyword: "FROM users WHERE " is NOT "table + alias"
  const alias = '(?!(?:' + [...RESERVED].join('|') + ')\\b)[\\w$]+'
  const ident = '[`"[]?[\\w$]+[`"\\]]?'
  return new RegExp('\\b(?:FROM|JOIN|UPDATE|INTO)\\s+(?:' + ident + '\\.)?' + ident + '(?:\\s+(?:AS\\s+)?' + alias + ')?\\s+$', 'i').test(t)
}


export interface TableRef { table: string; alias?: string; ns?: string }

/** Tables (with aliases) referenced by a statement. `known` filters out words that are not real tables. */
export function tablesInStatement(stmt: string, known: (name: string, ns?: string) => string | undefined): TableRef[] {
  const t = stripNoise(stmt)
  const out: TableRef[] = []
  const one = /\b(?:FROM|JOIN|UPDATE|INTO)\s+(?:`?([\w$]+)`?\.)?`?([\w$]+)`?(?:\s+(?:AS\s+)?([\w$]+))?/gi
  let m: RegExpExecArray | null
  while ((m = one.exec(t))) {
    const real = known(m[2], m[1])
    if (real) out.push({ table: real, ns: m[1], alias: m[3] && !RESERVED.has(m[3].toUpperCase()) ? m[3] : undefined })
  }
  // comma lists: FROM a, b x, c
  const seg = /\bFROM\s+([^;]*?)(?=\b(?:WHERE|GROUP|ORDER|LIMIT|HAVING|UNION|JOIN|ON)\b|;|$)/gi
  while ((m = seg.exec(t))) {
    for (const part of m[1].split(',').slice(1)) {
      const p = /^\s*(?:`?([\w$]+)`?\.)?`?([\w$]+)`?(?:\s+(?:AS\s+)?([\w$]+))?/i.exec(part)
      const real = p && known(p[2], p[1])
      if (p && real && !out.some((o) => o.table === real && o.alias === p[3])) out.push({ table: real, ns: p[1], alias: p[3] && !RESERVED.has(p[3].toUpperCase()) ? p[3] : undefined })
    }
  }
  return out
}

/** Identifier the user is currently typing plus an optional "qualifier." before it. */
export function wordBefore(lineBefore: string): { qualifier?: string; word: string } {
  const m = /(?:([\w$]+)\.)?([\w$]*)$/.exec(lineBefore)
  return { qualifier: m?.[1], word: m?.[2] ?? '' }
}
