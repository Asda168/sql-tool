import * as monaco from 'monaco-editor'
import { ENGINES, quoteIdent, type EngineId } from '../lib/engines'
import type { SchemaFk, SchemaInfo } from '../lib/introspect'
import { afterTableRef, clauseAt, fuzzyScore, tablesInStatement, wordBefore, type Clause } from '../lib/sqlContext'
import { splitStatements } from '../lib/sqlSafety'
import { usageOf } from '../lib/usage'
import { useApp } from '../store/app'

/**
 * Context-aware SQL completion:
 *  - clause-aware: tables after FROM/JOIN, columns of the tables in the statement elsewhere, next keywords after a table
 *  - foreign-key aware: JOIN tables and ON conditions come from real relationships
 *  - ranked: exact > prefix > word-start > substring > subsequence, plus how often you use each name
 *  - syntax snippets and per-engine functions
 */

interface Ctx { connId?: string; engine: EngineId; ns?: string; schemas: Record<string, SchemaInfo>; namespaces: string[] }

function contextFor(uriPath: string): Ctx {
  const st = useApp.getState()
  const id = /tab-([^/.]+)/.exec(uriPath)?.[1]
  const tab = st.tabs.find((t) => t.id === id)
  const connId = (tab && tab.kind === 'sql' ? tab.connId : undefined) ?? st.activeConnId
  const cfg = st.connections.find((c) => c.id === connId)
  const sess = connId ? st.sessions[connId] : undefined
  const engine = sess?.engine ?? cfg?.engine ?? 'mysql'
  const schemas = (connId && st.schemaCache[connId]) || {}
  const namespaces = (connId && st.namespaces[connId]) || []
  const user = namespaces.filter((n) => !ENGINES[engine].systemDatabases.includes(n))
  const ns = (connId && st.selectedNs[connId]) || cfg?.database || (engine === 'sqlite' ? 'main' : user.length === 1 ? user[0] : undefined)
  return { connId, engine, ns: ns && schemas[ns] ? ns : ns, schemas, namespaces }
}

const ident = (engine: EngineId, name: string) => (/^[A-Za-z_][\w$]*$/.test(name) ? name : quoteIdent(engine, name))

// ---------- keywords, snippets, functions ----------
const STARTERS = ['SELECT', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE TABLE', 'WITH', 'EXPLAIN', 'SHOW TABLES', 'SHOW DATABASES', 'DESCRIBE', 'USE']
const AFTER_TABLE = ['WHERE', 'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', 'HAVING', 'UNION', 'UNION ALL']
const CONDITION = ['AND', 'OR', 'NOT', 'IN (', 'NOT IN (', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'EXISTS (', 'GROUP BY', 'ORDER BY', 'LIMIT']
const SELECT_WORDS = ['*', 'DISTINCT', 'FROM', 'AS', 'CASE WHEN']

const COMMON_FN = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST', 'LOWER', 'UPPER', 'TRIM', 'SUBSTRING', 'LENGTH', 'REPLACE', 'CONCAT', 'ROUND', 'ABS']
const FN: Record<EngineId, string[]> = {
  mysql: ['IFNULL', 'IF', 'NOW', 'CURDATE', 'DATE_FORMAT', 'DATEDIFF', 'DATE_ADD', 'STR_TO_DATE', 'GROUP_CONCAT', 'JSON_EXTRACT', 'CONCAT_WS', 'FLOOR', 'CEIL', 'UUID'],
  mariadb: ['IFNULL', 'IF', 'NOW', 'CURDATE', 'DATE_FORMAT', 'DATEDIFF', 'DATE_ADD', 'STR_TO_DATE', 'GROUP_CONCAT', 'JSON_EXTRACT', 'CONCAT_WS', 'FLOOR', 'CEIL', 'UUID'],
  postgres: ['NOW', 'CURRENT_DATE', 'TO_CHAR', 'DATE_TRUNC', 'STRING_AGG', 'ARRAY_AGG', 'JSONB_BUILD_OBJECT', 'GENERATE_SERIES', 'EXTRACT', 'GREATEST', 'LEAST', 'GEN_RANDOM_UUID'],
  sqlite: ['IFNULL', 'DATE', 'DATETIME', 'STRFTIME', 'GROUP_CONCAT', 'RANDOM', 'IIF', 'JSON_EXTRACT'],
  mssql: ['ISNULL', 'GETDATE', 'DATEADD', 'DATEDIFF', 'FORMAT', 'STRING_AGG', 'NEWID', 'LEN', 'CHARINDEX', 'TRY_CAST', 'TOP'],
}

interface Snip { label: string; body: string; doc: string; where: Clause[] }
const snippets = (engine: EngineId): Snip[] => {
  const limit = engine === 'mssql' ? ['SELECT TOP 100 ${1:*}\nFROM ${2:table}\nWHERE ${3:1 = 1};'] : ['SELECT ${1:*}\nFROM ${2:table}\nWHERE ${3:1 = 1}\nLIMIT ${4:100};']
  const create = engine === 'mysql' || engine === 'mariadb'
    ? 'CREATE TABLE ${1:table_name} (\n    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,\n    ${2:name} VARCHAR(255) NOT NULL,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    PRIMARY KEY (id)\n);'
    : engine === 'postgres' ? 'CREATE TABLE ${1:table_name} (\n    id BIGSERIAL PRIMARY KEY,\n    ${2:name} VARCHAR(255) NOT NULL,\n    created_at TIMESTAMPTZ DEFAULT NOW()\n);'
      : engine === 'mssql' ? 'CREATE TABLE ${1:table_name} (\n    id BIGINT IDENTITY(1,1) PRIMARY KEY,\n    ${2:name} NVARCHAR(255) NOT NULL,\n    created_at DATETIME2 DEFAULT GETDATE()\n);'
        : 'CREATE TABLE ${1:table_name} (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    ${2:name} TEXT NOT NULL,\n    created_at TEXT DEFAULT CURRENT_TIMESTAMP\n);'
  return [
    { label: 'SELECT … FROM … WHERE', body: limit[0], doc: 'Query rows', where: ['start'] },
    { label: 'SELECT COUNT(*)', body: 'SELECT COUNT(*) AS total\nFROM ${1:table}\nWHERE ${2:1 = 1};', doc: 'Count rows', where: ['start'] },
    { label: 'SELECT … GROUP BY', body: 'SELECT ${1:column}, COUNT(*) AS total\nFROM ${2:table}\nGROUP BY ${1:column}\nORDER BY total DESC;', doc: 'Group and count', where: ['start'] },
    { label: 'INSERT INTO … VALUES', body: 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});', doc: 'Insert a row', where: ['start'] },
    { label: 'UPDATE … SET … WHERE', body: 'UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};', doc: 'Update rows (keep the WHERE!)', where: ['start'] },
    { label: 'DELETE FROM … WHERE', body: 'DELETE FROM ${1:table}\nWHERE ${2:condition};', doc: 'Delete rows (keep the WHERE!)', where: ['start'] },
    { label: 'CREATE TABLE', body: create, doc: 'New table skeleton', where: ['start'] },
    { label: 'WITH … (CTE)', body: 'WITH ${1:name} AS (\n    SELECT ${2:*}\n    FROM ${3:table}\n)\nSELECT * FROM ${1:name};', doc: 'Common table expression', where: ['start'] },
    { label: 'LEFT JOIN … ON', body: 'LEFT JOIN ${1:table} ${2:t} ON ${2:t}.${3:id} = ${4:other}.${5:id}', doc: 'Join another table', where: ['from', 'join', 'where'] },
    { label: 'INNER JOIN … ON', body: 'INNER JOIN ${1:table} ${2:t} ON ${2:t}.${3:id} = ${4:other}.${5:id}', doc: 'Join another table', where: ['from', 'join', 'where'] },
    { label: 'CASE WHEN … END', body: 'CASE WHEN ${1:condition} THEN ${2:value} ELSE ${3:other} END', doc: 'Conditional expression', where: ['select', 'where', 'orderby', 'set'] },
    { label: 'EXISTS (subquery)', body: 'EXISTS (SELECT 1 FROM ${1:table} WHERE ${2:condition})', doc: 'Subquery test', where: ['where', 'on'] },
  ]
}

type Item = monaco.languages.CompletionItem
const K = monaco.languages.CompletionItemKind
const SNIPPET_RULE = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet

function lookupTable(ctx: Ctx, name: string, nsQ?: string): { table: string; ns: string } | undefined {
  const spaces = nsQ ? [nsQ] : ctx.ns ? [ctx.ns] : Object.keys(ctx.schemas)
  const l = name.toLowerCase()
  for (const n of spaces) {
    const hit = Object.keys(ctx.schemas[n]?.tables ?? {}).find((t) => t.toLowerCase() === l)
    if (hit) return { table: hit, ns: n }
  }
  return undefined
}

function fkLinks(ctx: Ctx, a: { table: string; ns: string }, b: { table: string; ns: string }): SchemaFk[] {
  const fks = ctx.schemas[a.ns]?.fks ?? []
  return fks.filter((f) => (f.table === a.table && f.refTable === b.table) || (f.table === b.table && f.refTable === a.table))
}

export async function provide(model: monaco.editor.ITextModel, position: monaco.Position): Promise<monaco.languages.CompletionList> {
  const ctx = contextFor(model.uri.path)
  const engine = ctx.engine
  const lineBefore = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
  const { qualifier, word } = wordBefore(lineBefore)
  const w = model.getWordUntilPosition(position)
  const range = new monaco.Range(position.lineNumber, w.startColumn, position.lineNumber, w.endColumn)
  const full = model.getValue()
  const offset = model.getOffsetAt(position)
  const stmt = splitStatements(full).find((s) => offset >= s.start && offset <= s.end + 1)
  const stmtText = stmt?.text ?? ''
  const before = stmt ? full.slice(stmt.start, offset) : ''
  const clause = clauseAt(before)
  const after = afterTableRef(before)
  const refs = tablesInStatement(stmtText || before, (n, nsQ) => lookupTable(ctx, n, nsQ)?.table)
  const resolved = refs.map((r) => ({ ...r, ns: lookupTable(ctx, r.table, r.ns)?.ns ?? ctx.ns ?? '' }))
  const out: { item: Item; score: number }[] = []
  const add = (label: string, score: number, extra: Partial<Item> = {}) => {
    out.push({ score, item: { label, kind: K.Text, insertText: label, range, filterText: word || label, ...extra } as Item })
  }
  const rank = (name: string, boost = 0, use = 0) => { const f = fuzzyScore(word, name); return f < 0 ? -1 : f + boost + Math.min(80, use * 6) }

  // ---- "qualifier." : a table/alias (columns) or a database (tables)
  if (qualifier) {
    const ref = resolved.find((r) => r.alias?.toLowerCase() === qualifier.toLowerCase() || r.table.toLowerCase() === qualifier.toLowerCase())
    const direct = ref ?? (lookupTable(ctx, qualifier) ? { ...lookupTable(ctx, qualifier)!, alias: undefined } : undefined)
    if (direct) {
      for (const c of ctx.schemas[direct.ns]?.tables[direct.table]?.columns ?? []) {
        const r = rank(c.name, c.key === 'PRI' ? 30 : 0, usageOf(ctx.connId, c.name))
        if (r >= 0) add(c.name, r, { kind: c.key === 'PRI' ? K.Reference : K.Field, insertText: ident(engine, c.name), detail: `${direct.table} · ${c.type}${c.key ? ' · ' + c.key : ''}`, sortText: '' })
      }
    } else if (ctx.namespaces.some((n) => n.toLowerCase() === qualifier.toLowerCase())) {
      const ns = ctx.namespaces.find((n) => n.toLowerCase() === qualifier.toLowerCase())!
      const info = ctx.schemas[ns] ?? (ctx.connId ? await useApp.getState().loadNs(ctx.connId, ns) : undefined)
      for (const [t, v] of Object.entries(info?.tables ?? {})) {
        const r = rank(t, 0, usageOf(ctx.connId, t))
        if (r >= 0) add(t, r, { kind: v.kind === 'view' ? K.Interface : K.Class, insertText: ident(engine, t), detail: `${v.kind} · ${v.columns.length} columns · ${ns}` })
      }
    }
    return finish(out)
  }

  // ---- tables (FROM / JOIN / INTO / UPDATE / TABLE)
  const wantsTable = (clause === 'from' || clause === 'join' || clause === 'into' || clause === 'update' || clause === 'table') && !after
  if (wantsTable) {
    const inStmt = resolved.filter((r) => r.table)
    for (const [ns, info] of Object.entries(ctx.schemas)) {
      if (ctx.ns && ns !== ctx.ns && word.length < 2) continue // other databases only when the user is actually searching
      for (const [t, v] of Object.entries(info.tables)) {
        let boost = ns === ctx.ns ? 40 : 0
        let hint = ''
        if (clause === 'join' && inStmt.length) {
          const linked = inStmt.some((r) => fkLinks(ctx, { table: r.table, ns: r.ns }, { table: t, ns }).length > 0)
          if (linked) { boost += 300; hint = ' · related (foreign key)' }
        }
        const r = rank(t, boost, usageOf(ctx.connId, t))
        if (r >= 0) add(t, r, { kind: v.kind === 'view' ? K.Interface : K.Class, insertText: ident(engine, t) === t && ns !== ctx.ns ? `${ns}.${t}` : ident(engine, t), detail: `${v.kind} · ${v.columns.length} columns${ns !== ctx.ns ? ' · ' + ns : ''}${hint}` })
      }
    }
    for (const n of ctx.namespaces) {
      if (n === ctx.ns) continue
      const r = rank(n, -150)
      if (r >= 0 && word.length >= 1) add(n, r, { kind: K.Module, insertText: `${n}.`, detail: ENGINES[engine].namespace.toLowerCase(), command: { id: 'editor.action.triggerSuggest', title: '' } })
    }
    if (!Object.keys(ctx.schemas).length) add('(select a database in the status bar)', 1, { kind: K.Text, insertText: '', detail: 'no schema loaded yet' })
    return finish(out)
  }

  // ---- after a complete table reference: next keyword, JOIN ... ON from foreign keys
  if (after) {
    for (const k of AFTER_TABLE) { const r = rank(k, 120); if (r >= 0) add(k, r, { kind: K.Keyword }) }
    if (clause === 'join' && resolved.length >= 2) {
      const last = resolved[resolved.length - 1]
      for (const prev of resolved.slice(0, -1)) {
        for (const fk of fkLinks(ctx, { table: last.table, ns: last.ns }, { table: prev.table, ns: prev.ns })) {
          const a = last.alias ?? last.table, b = prev.alias ?? prev.table
          const [lc, pc] = fk.table === last.table ? [fk.column, fk.refColumn] : [fk.refColumn, fk.column]
          add(`ON ${a}.${lc} = ${b}.${pc}`, 2000, { kind: K.Snippet, insertText: `ON ${a}.${ident(engine, lc)} = ${b}.${ident(engine, pc)}`, detail: 'join condition from foreign key' })
        }
      }
    }
    return finish(out)
  }

  // ---- columns of the tables in the statement
  const colClauses: Clause[] = ['select', 'where', 'on', 'groupby', 'orderby', 'having', 'set', 'values', 'into', 'limit']
  if (colClauses.includes(clause) || clause === 'other') {
    const multi = resolved.length > 1
    // ON <fk condition> suggestions right after ON
    if (clause === 'on' && resolved.length >= 2 && !word) {
      const last = resolved[resolved.length - 1]
      for (const prev of resolved.slice(0, -1)) {
        for (const fk of fkLinks(ctx, { table: last.table, ns: last.ns }, { table: prev.table, ns: prev.ns })) {
          const a = last.alias ?? last.table, b = prev.alias ?? prev.table
          const [lc, pc] = fk.table === last.table ? [fk.column, fk.refColumn] : [fk.refColumn, fk.column]
          add(`${a}.${lc} = ${b}.${pc}`, 2000, { kind: K.Snippet, insertText: `${a}.${ident(engine, lc)} = ${b}.${ident(engine, pc)}`, detail: 'from foreign key' })
        }
      }
    }
    const seen = new Set<string>()
    for (const r of resolved) {
      for (const c of ctx.schemas[r.ns]?.tables[r.table]?.columns ?? []) {
        const q = r.alias ?? r.table
        const key = `${q}.${c.name}`
        if (seen.has(key)) continue
        seen.add(key)
        // columns come before keywords/functions wherever a column is expected
        const sc = rank(c.name, 100 + (c.key === 'PRI' ? 30 : c.key === 'MUL' ? 10 : 0), usageOf(ctx.connId, c.name))
        if (sc >= 0) add(c.name, sc, { kind: c.key === 'PRI' ? K.Reference : K.Field, insertText: multi ? `${q}.${ident(engine, c.name)}` : ident(engine, c.name), detail: `${r.table} · ${c.type}${c.key ? ' · ' + c.key : ''}`, filterText: word || (multi ? `${q}.${c.name}` : c.name) })
      }
    }
    // table/alias names themselves help when typing "u" -> "u."
    if (multi && word) for (const r of resolved) { const q = r.alias ?? r.table; const sc = rank(q, -20); if (sc >= 0 && q.toLowerCase() !== word.toLowerCase()) add(q, sc, { kind: K.Variable, insertText: `${q}.`, detail: `alias of ${r.table}`, command: { id: 'editor.action.triggerSuggest', title: '' } }) }
  }

  // ---- keywords by clause
  const kw = clause === 'start' ? STARTERS : clause === 'select' ? SELECT_WORDS : clause === 'orderby' ? ['ASC', 'DESC', 'LIMIT'] : clause === 'groupby' ? ['HAVING', 'ORDER BY', 'LIMIT'] : clause === 'where' || clause === 'on' || clause === 'having' ? CONDITION : clause === 'set' ? ['WHERE'] : []
  for (const k of kw) { const r = rank(k, clause === 'start' ? 150 : 60); if (r >= 0 && (word || clause !== 'start')) add(k, r, { kind: K.Keyword }) }

  // ---- functions
  if (word && (clause === 'select' || clause === 'where' || clause === 'on' || clause === 'having' || clause === 'orderby' || clause === 'set' || clause === 'groupby')) {
    for (const f of [...COMMON_FN, ...FN[engine]]) { const r = rank(f, 20); if (r >= 0) add(`${f}()`, r, { kind: K.Function, insertText: `${f}(\${1})`, insertTextRules: SNIPPET_RULE, detail: 'function' }) }
  }

  // ---- syntax snippets
  for (const s of snippets(engine)) {
    if (!s.where.includes(clause) && !(clause === 'other' && s.where.includes('start'))) continue
    const r = rank(s.label, clause === 'start' ? 100 : 40)
    if (r >= 0 && (word || clause === 'start')) add(s.label, r, { kind: K.Snippet, insertText: s.body, insertTextRules: SNIPPET_RULE, detail: 'snippet', documentation: s.doc })
  }

  // ---- at the start of a statement: typing a table name offers a ready-made query
  if (clause === 'start' && word.length >= 2) {
    for (const [ns, info] of Object.entries(ctx.schemas)) {
      if (ctx.ns && ns !== ctx.ns) continue
      for (const [t, v] of Object.entries(info.tables)) {
        const r = rank(t, 60, usageOf(ctx.connId, t))
        if (r < 0 || r < 500) continue
        const tn = ident(engine, t)
        add(`SELECT * FROM ${t}`, r + 5, { kind: K.Snippet, insertText: engine === 'mssql' ? `SELECT TOP 100 * FROM ${tn};` : `SELECT * FROM ${tn}\nLIMIT 100;`, detail: `quick select · ${v.columns.length} columns`, filterText: word })
        add(t, r, { kind: v.kind === 'view' ? K.Interface : K.Class, insertText: tn, detail: `${v.kind} · ${v.columns.length} columns` })
      }
    }
  }
  return finish(out)
}

function finish(list: { item: Item; score: number }[]): monaco.languages.CompletionList {
  const seen = new Set<string>()
  const sorted = list.sort((a, b) => b.score - a.score)
  const suggestions: Item[] = []
  for (const { item, score } of sorted) {
    const key = `${String(item.label)}|${item.detail ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    suggestions.push({ ...item, sortText: String(99999 - Math.round(score)).padStart(5, '0') })
    if (suggestions.length >= 60) break
  }
  return { suggestions }
}

export function registerCompletion() {
  return monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' ', ',', '(', '='],
    provideCompletionItems: (model, position) => provide(model, position),
  })
}
