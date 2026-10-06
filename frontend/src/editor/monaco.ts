import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import { loader } from '@monaco-editor/react'
import { splitStatements } from '../lib/sqlSafety'
import { useApp } from '../store/app'

// Bundle Monaco locally (works offline in the desktop app) instead of loading it from a CDN.
;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = { getWorker: () => new editorWorker() }
loader.config({ monaco })

export const FORGE_DARK = 'forge-dark'
export const FORGE_LIGHT = 'forge-light'
monaco.editor.defineTheme(FORGE_DARK, {
  base: 'vs-dark', inherit: true, rules: [],
  colors: { 'editor.background': '#0f1520', 'editor.lineHighlightBackground': '#17202e', 'editorLineNumber.foreground': '#4a5772', 'editorGutter.background': '#0f1520' },
})
monaco.editor.defineTheme(FORGE_LIGHT, {
  base: 'vs', inherit: true, rules: [],
  colors: { 'editor.background': '#ffffff', 'editor.lineHighlightBackground': '#eef2f7' },
})

const KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'DISTINCT', 'COUNT(*)', 'SUM(', 'AVG(', 'MIN(', 'MAX(', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CASE WHEN', 'UNION', 'EXISTS', 'ASC', 'DESC']
const MAX = 40

/** Tab id is encoded in the model path (`tab-<id>`), which lets the provider find that tab's connection. */
function schemaFor(uri: string): Record<string, string[]> {
  const st = useApp.getState()
  const id = /tab-([^/.]+)/.exec(uri)?.[1]
  const tab = st.tabs.find((t) => t.id === id)
  const connId = (tab && tab.kind === 'sql' ? tab.connId : undefined) ?? st.activeConnId
  return (connId && st.schemaCache[connId]) || {}
}

const IDENT = /[A-Za-z_][\w$]*/

function tablesInStatement(text: string, schema: Record<string, string[]>): { table: string; alias?: string }[] {
  const out: { table: string; alias?: string }[] = []
  const re = /\b(?:FROM|JOIN|UPDATE|INTO)\s+[`"[]?([A-Za-z_][\w$]*)[`"\]]?(?:\s+(?:AS\s+)?([A-Za-z_][\w$]*))?/gi
  let m: RegExpExecArray | null
  const reserved = /^(WHERE|ON|SET|LEFT|RIGHT|INNER|OUTER|JOIN|GROUP|ORDER|LIMIT|HAVING|UNION|VALUES|USING|CROSS|FULL)$/i
  while ((m = re.exec(text))) {
    const t = Object.keys(schema).find((k) => k.toLowerCase() === m![1].toLowerCase())
    if (t) out.push({ table: t, alias: m[2] && !reserved.test(m[2]) ? m[2] : undefined })
  }
  return out
}

monaco.languages.registerCompletionItemProvider('sql', {
  triggerCharacters: ['.', ' '],
  provideCompletionItems(model, position) {
    const schema = schemaFor(model.uri.path)
    const word = model.getWordUntilPosition(position)
    const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
    const full = model.getValue()
    const offset = model.getOffsetAt(position)
    const stmt = splitStatements(full).find((s) => offset >= s.start && offset <= s.end + 1)?.text ?? full
    const before = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column })
    const lineBefore = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
    const prefix = word.word.toLowerCase()
    const K = monaco.languages.CompletionItemKind
    const tables = Object.keys(schema)
    const match = (s: string) => !prefix || s.toLowerCase().startsWith(prefix) || s.toLowerCase().includes(prefix)
    const rank = (s: string) => (s.toLowerCase().startsWith(prefix) ? '0' : '1') + s.toLowerCase()
    const mkTable = (t: string) => ({ label: t, kind: K.Class, insertText: t, range, detail: `${schema[t].length} columns`, sortText: rank(t) })
    const mkCol = (c: string, t: string) => ({ label: c, kind: K.Field, insertText: c, range, detail: t, sortText: rank(c) })

    // alias.<column>
    const dot = /([A-Za-z_][\w$]*)\.\s*[\w$]*$/.exec(lineBefore)
    if (dot) {
      const q = dot[1].toLowerCase()
      const ref = tablesInStatement(stmt, schema).find((r) => r.alias?.toLowerCase() === q || r.table.toLowerCase() === q)
      const t = ref?.table ?? tables.find((k) => k.toLowerCase() === q)
      return { suggestions: t ? schema[t].filter(match).slice(0, MAX).map((c) => mkCol(c, t)) : [] }
    }
    // table position: after FROM / JOIN / INTO / UPDATE / TABLE
    const tail = before.slice(-200).replace(/[\w$]*$/, '')
    if (/\b(FROM|JOIN|INTO|UPDATE|TABLE|DESCRIBE|DESC)\s+[`"[]?$/i.test(tail) || /\bFROM\s+[\w$.`"]+\s*,\s*$/i.test(tail)) {
      return { suggestions: tables.filter(match).sort((a, b) => rank(a).localeCompare(rank(b))).slice(0, MAX).map(mkTable) }
    }
    // column position: columns of the tables mentioned in this statement
    const refs = tablesInStatement(stmt, schema)
    const suggestions: monaco.languages.CompletionItem[] = []
    const seen = new Set<string>()
    for (const r of refs) for (const c of schema[r.table]) if (match(c) && !seen.has(c)) { seen.add(c); suggestions.push(mkCol(c, r.table)) }
    if (prefix.length >= 1) {
      for (const k of KEYWORDS) if (k.toLowerCase().startsWith(prefix)) suggestions.push({ label: k, kind: K.Keyword, insertText: k, range, sortText: '2' + k })
      if (!refs.length) for (const t of tables.filter(match)) suggestions.push(mkTable(t))
    }
    return { suggestions: suggestions.slice(0, MAX) }
  },
})

monaco.languages.registerDocumentSymbolProvider('sql', {
  provideDocumentSymbols(model) {
    const text = model.getValue()
    return splitStatements(text).map((s) => {
      const a = model.getPositionAt(s.start), b = model.getPositionAt(s.end)
      const range = new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column)
      return { name: s.text.replace(/\s+/g, ' ').slice(0, 60), detail: '', kind: monaco.languages.SymbolKind.Function, range, selectionRange: range, tags: [] }
    })
  },
})

export { monaco, IDENT }
