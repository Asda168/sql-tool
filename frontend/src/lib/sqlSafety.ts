/** Static SQL classification. Mirrors backend/database/sqlsafety.py. */
export type StatementKind =
  | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DROP' | 'ALTER' | 'TRUNCATE' | 'CREATE'
  | 'REPLACE' | 'SHOW' | 'DESCRIBE' | 'EXPLAIN' | 'USE' | 'SET' | 'PRAGMA' | 'OTHER'

export interface Verdict { statement: string; kind: StatementKind; destructive: boolean; reasons: string[]; start: number; end: number }

const KINDS = new Set<string>(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'REPLACE', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'USE', 'SET', 'PRAGMA'])
const READ_ONLY = new Set<string>(['SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'USE'])

/** Split on ';' outside quotes/comments. Offsets refer to the original text (comments kept for ranges). */
export function splitStatements(sql: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = []
  let buf = ''
  let start = 0
  let quote: string | null = null
  const n = sql.length
  const push = (end: number) => {
    const t = buf.trim()
    if (t) out.push({ text: t, start, end })
    buf = ''
  }
  for (let i = 0; i < n; i++) {
    const c = sql[i], nx = sql[i + 1]
    if (buf.trim() === '' && !quote) start = i
    if (quote) {
      buf += c
      if (c === '\\' && quote !== '`' && i + 1 < n) { buf += nx; i++ }
      else if (c === quote) { if (nx === quote) { buf += nx; i++ } else quote = null }
    } else if (c === "'" || c === '"' || c === '`') { quote = c; buf += c }
    else if (c === '-' && nx === '-' && (i + 2 >= n || /\s/.test(sql[i + 2]))) { while (i < n && sql[i] !== '\n') i++ }
    else if (c === '#') { while (i < n && sql[i] !== '\n') i++ }
    else if (c === '/' && nx === '*') { const e = sql.indexOf('*/', i + 2); i = e === -1 ? n : e + 1; buf += ' ' }
    else if (c === ';') { push(i) }
    else buf += c
  }
  push(n)
  return out
}

const stripLiterals = (s: string) => s.replace(/'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"|`[^`]*`|\[[^\]]*\]/g, "''")

export function classify(stmt: string, start = 0, end = stmt.length): Verdict {
  const parts = splitStatements(stmt)
  const text = parts[0]?.text ?? ''
  const stripped = stripLiterals(text)
  let word = (/^\s*\(?\s*(\w+)/.exec(stripped)?.[1] ?? '').toUpperCase()
  if (word === 'WITH') word = /\b(UPDATE|DELETE|INSERT)\b/i.exec(stripped)?.[1].toUpperCase() ?? 'SELECT'
  if (word === 'DESC') word = 'DESCRIBE'
  const kind = (KINDS.has(word) ? word : 'OTHER') as StatementKind
  const hasWhere = /\bWHERE\b/i.test(stripped)
  const v: Verdict = { statement: text, kind, destructive: false, reasons: [], start, end }
  const flag = (r: string) => { v.destructive = true; v.reasons.push(r) }
  if (kind === 'DROP') flag('DROP permanently removes objects.')
  else if (kind === 'TRUNCATE') flag('TRUNCATE removes every row and cannot be rolled back.')
  else if (kind === 'ALTER') flag('ALTER changes the schema.')
  else if (kind === 'DELETE' && !hasWhere) flag('DELETE without WHERE removes every row.')
  else if (kind === 'UPDATE' && !hasWhere) flag('UPDATE without WHERE modifies every row.')
  else if (kind === 'SELECT' && /\bINTO\s+(OUTFILE|DUMPFILE)\b/i.test(stripped)) flag('SELECT ... INTO OUTFILE writes to the server filesystem.')
  return v
}

export interface Analysis { statements: Verdict[]; readOnly: boolean; requiresConfirmation: boolean }

export function analyse(sql: string): Analysis {
  const statements = splitStatements(sql).map((s) => classify(s.text, s.start, s.end))
  return {
    statements,
    readOnly: statements.length > 0 && statements.every((s) => READ_ONLY.has(s.kind) && !s.destructive),
    requiresConfirmation: statements.some((s) => s.destructive),
  }
}

/** The statement containing the cursor offset (for Ctrl+Shift+Enter). */
export function statementAt(sql: string, offset: number): string {
  const all = splitStatements(sql)
  return (all.find((s) => offset >= s.start && offset <= s.end + 1) ?? all[all.length - 1])?.text ?? ''
}

/** Statements that modify data and so should be confirmed on production connections. */
export const isWrite = (k: StatementKind) => !READ_ONLY.has(k) && k !== 'SET' && k !== 'PRAGMA'
