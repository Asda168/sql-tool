import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import { loader } from '@monaco-editor/react'
import { splitStatements } from '../lib/sqlSafety'
import { registerCompletion } from './completion'
import { formatSql } from '../lib/format'
import { useApp } from '../store/app'

// Bundle Monaco locally (works offline in the desktop app) instead of loading it from a CDN.
;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = { getWorker: () => new editorWorker() }
loader.config({ monaco })

export const FORGE_DARK = 'forge-dark'
export const FORGE_LIGHT = 'forge-light'
monaco.editor.defineTheme(FORGE_DARK, {
  base: 'vs-dark', inherit: true, rules: [],
  colors: { 'editor.background': '#0d0d0d', 'editor.lineHighlightBackground': '#171717', 'editorLineNumber.foreground': '#5b5f66', 'editorGutter.background': '#0d0d0d', 'minimap.background': '#0d0d0d' },
})
monaco.editor.defineTheme(FORGE_LIGHT, {
  base: 'vs', inherit: true, rules: [],
  colors: { 'editor.background': '#ffffff', 'editor.lineHighlightBackground': '#eef2f7' },
})

registerCompletion()

// Right-click > Format Document / Format Selection (Shift+Alt+F): Monaco has no built-in SQL formatter.
function formatEngine() {
  const st = useApp.getState()
  const c = st.connections.find((x) => x.id === st.activeConnId)
  return { engine: (st.activeConnId ? st.sessions[st.activeConnId]?.engine : undefined) ?? c?.engine ?? 'mysql', tab: st.settings.tabSize }
}
monaco.languages.registerDocumentFormattingEditProvider('sql', {
  provideDocumentFormattingEdits(model) {
    const { engine, tab } = formatEngine()
    return [{ range: model.getFullModelRange(), text: formatSql(model.getValue(), engine, tab) }]
  },
})
monaco.languages.registerDocumentRangeFormattingEditProvider('sql', {
  provideDocumentRangeFormattingEdits(model, range) {
    const { engine, tab } = formatEngine()
    return [{ range, text: formatSql(model.getValueInRange(range), engine, tab) }]
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

/** The most recently focused editor, used by the Edit menu. */
export let activeEditor: monaco.editor.IStandaloneCodeEditor | null = null
export const setActiveEditor = (e: monaco.editor.IStandaloneCodeEditor | null) => { activeEditor = e }

export { monaco }
