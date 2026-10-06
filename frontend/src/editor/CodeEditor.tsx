import Editor, { type OnMount } from '@monaco-editor/react'
import './monaco'
import { FORGE_DARK, FORGE_LIGHT, setActiveEditor } from './monaco'
import { useApp } from '../store/app'
import { useCursor } from '../store/cursor'

const LANGS: Record<string, string> = {
  sql: 'sql', php: 'php', py: 'python', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', vue: 'html',
  html: 'html', css: 'css', scss: 'scss', json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', xml: 'xml', sh: 'shell', rs: 'rust', toml: 'ini', env: 'ini',
}
export const languageFor = (name: string) => LANGS[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'

export default function CodeEditor({ path, value, language, onChange, onMount, readOnly }: { path: string; value: string; language: string; onChange: (v: string) => void; onMount?: OnMount; readOnly?: boolean }) {
  const s = useApp((x) => x.settings)
  const theme = useApp((x) => x.resolvedTheme)
  const setSettings = useApp((x) => x.setSettings)
  const cursor = { line: 'line', block: 'block', underline: 'underline' } as const
  return (
    <div className="h-full w-full" onWheel={(e) => {
      // Ctrl + mouse wheel zooms the editor font
      if (e.ctrlKey) setSettings({ fontSize: Math.max(8, Math.min(48, s.fontSize + (e.deltaY < 0 ? 1 : -1))) })
    }}>
      <Editor
        path={path} language={language} value={value} theme={theme === 'dark' ? FORGE_DARK : FORGE_LIGHT}
        onChange={(v) => onChange(v ?? '')} onMount={(e, m) => { setActiveEditor(e); e.onDidFocusEditorText(() => setActiveEditor(e)); e.onDidChangeCursorPosition((c) => useCursor.setState({ line: c.position.lineNumber, col: c.position.column })); onMount?.(e, m) }}
        options={{
          readOnly, fontFamily: `"${s.fontFamily}", monospace`, fontSize: s.fontSize, fontWeight: String(s.fontWeight),
          lineHeight: Math.round(s.fontSize * s.lineHeight), letterSpacing: s.letterSpacing, fontLigatures: s.ligatures,
          wordWrap: s.wordWrap ? 'on' : 'off', minimap: { enabled: s.minimap }, cursorStyle: cursor[s.cursorStyle],
          tabSize: s.tabSize, folding: s.folding, stickyScroll: { enabled: s.breadcrumbs }, automaticLayout: true,
          scrollBeyondLastLine: false, smoothScrolling: true, multiCursorModifier: 'alt', renderWhitespace: 'selection',
          quickSuggestions: { other: true, comments: false, strings: false }, suggest: { showWords: false },
          mouseWheelZoom: false, padding: { top: 8 }, bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  )
}
