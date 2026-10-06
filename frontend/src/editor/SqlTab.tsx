import { useRef } from 'react'
import { BookmarkPlus, Eraser, Gauge, Play, PlayCircle, Save, Square, TextSelect } from 'lucide-react'
import type { editor } from 'monaco-editor'
import { bridge } from '../bridge'
import { ENGINES } from '../lib/engines'
import { formatSql } from '../lib/format'
import { mod } from '../lib/os'
import { useApp, type Tab } from '../store/app'
import ResultsGrid from '../database/ResultsGrid'
import { EnvBadge, Splitter, useSplitter } from '../components/ui'
import CodeEditor from './CodeEditor'

type SqlTabT = Extract<Tab, { kind: 'sql' }>

export default function SqlTab({ tab }: { tab: SqlTabT }) {
  const st = useApp()
  const ed = useRef<editor.IStandaloneCodeEditor | null>(null)
  const { size, start } = useSplitter(260, 80, 900, 'y', true)
  const connId = tab.connId ?? st.activeConnId
  const cfg = st.connections.find((c) => c.id === connId)
  const sess = connId ? st.sessions[connId] : undefined
  const engine = sess?.engine ?? cfg?.engine ?? 'mysql'
  const res = st.results[tab.id]

  const sel = () => {
    const e = ed.current
    const m = e?.getModel()
    const s = e?.getSelection()
    if (!e || !m || !s) return undefined
    return { text: m.getValueInRange(s), offset: m.getOffsetAt(e.getPosition()!) }
  }
  const run = (mode: 'all' | 'selection' | 'statement') => void st.runSql(tab.id, mode, sel())
  const explain = async () => {
    const info = ENGINES[engine]
    const e = ed.current
    const text = (sel()?.text.trim() || tab.content).replace(/;\s*$/, '')
    if (!text) return
    if (engine === 'mssql') return st.toast('info', 'SQL Server: enable SET SHOWPLAN_TEXT ON in the editor to see plans.')
    const id = st.newSqlTab(`${info.explain}${text};`, 'explain.sql')
    st.updateTab(id, { connId })
    setTimeout(() => void useApp.getState().runSql(id, 'all'), 0)
    void e
  }
  const format = () => {
    const e = ed.current
    const m = e?.getModel()
    if (!e || !m) return
    const out = formatSql(m.getValue(), engine, st.settings.tabSize)
    e.executeEdits('format', [{ range: m.getFullModelRange(), text: out }])
  }
  const exportAll = async () => {
    if (!res?.result) return
    const { toCsv } = await import('../lib/exporters')
    const ok = await bridge().fs.saveDialog('results.csv', toCsv(res.result.columns, res.result.rows))
    if (ok) st.toast('success', 'Exported CSV')
  }

  const onMount = (e: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
    ed.current = e
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run(sel()?.text.trim() ? 'selection' : 'all'))
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => run('statement'))
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void useApp.getState().saveTab(tab.id))
  }

  const r = res?.result
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-panel px-2 py-1.5">
        <select aria-label="Connection" className="rounded-md border border-line bg-bg px-1.5 py-1 text-xs" value={connId ?? ''} onChange={(e) => st.updateTab(tab.id, { connId: e.target.value || undefined })}>
          <option value="">No connection</option>
          {st.connections.map((c) => <option key={c.id} value={c.id}>{c.name}{st.sessions[c.id] ? ' ●' : ''}</option>)}
        </select>
        {cfg && <EnvBadge env={cfg.environment} />}
        {connId && !sess && <button className="btn" onClick={() => st.connect(connId).catch((e) => st.toast('error', e.message ?? String(e)))}>Connect</button>}
        <div className="mx-1 h-4 w-px bg-line" />
        <button className="btn btn-primary" onClick={() => run('all')} disabled={res?.running} title={`Run (${mod()}+Enter)`}><Play size={13} />Run</button>
        <button className="btn" onClick={() => run('selection')} disabled={res?.running} title="Run selection"><TextSelect size={13} />Run Selection</button>
        <button className="btn" onClick={() => run('statement')} disabled={res?.running} title={`Run current statement (${mod()}+Shift+Enter)`}><PlayCircle size={13} />Statement</button>
        {res?.running && <button className="btn btn-danger" onClick={() => st.cancelQuery(tab.id)}><Square size={12} />Cancel</button>}
        <button className="btn" onClick={explain}><Gauge size={13} />Explain</button>
        <button className="btn" onClick={format}><Eraser size={13} />Format</button>
        <button className="btn" onClick={() => st.saveTab(tab.id)} title={`Save (${mod()}+S)`}><Save size={13} />Save</button>
        <button className="btn" onClick={() => st.setDialog({ type: 'save-query', sql: tab.content })}><BookmarkPlus size={13} />Save query</button>
        <button className="btn" onClick={exportAll} disabled={!r}>Export</button>
      </div>
      <div className="min-h-[80px] flex-1">
        <CodeEditor path={`tab-${tab.id}.sql`} language="sql" value={tab.content} onChange={(v) => st.updateTab(tab.id, { content: v, dirty: true })} onMount={onMount} />
      </div>
      <Splitter dir="y" onMouseDown={start} />
      <div className="flex min-h-0 flex-col bg-panel" style={{ height: size }}>
        {!res && <div className="p-4 text-xs text-muted">Run a query to see results here. {mod()}+Enter runs the query, {mod()}+Shift+Enter runs the current statement.</div>}
        {res?.running && <div className="p-4 text-xs text-accent" role="status">Running…</div>}
        {res?.error && !res.running && (
          <div className="p-3 text-xs" role="alert"><div className="font-semibold text-danger">✕ Query failed</div><pre className="code mt-1 whitespace-pre-wrap text-danger">{res.error}</pre></div>
        )}
        {r && !res?.running && (
          <>
            <div className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-1 text-xs" role="status">
              <span className="text-ok">✓ Query completed successfully</span>
              <span>{r.columns.length ? `${r.rows.length.toLocaleString()} rows` : `${r.affected.toLocaleString()} rows affected`}</span>
              <span>{(r.elapsedMs / 1000).toFixed(3)} seconds</span>
              <span className="text-muted">{cfg?.database || cfg?.filePath || ''}</span>
            </div>
            {r.columns.length > 0 ? <div className="min-h-0 flex-1"><ResultsGrid columns={r.columns} rows={r.rows} engine={engine} truncated={r.truncated} /></div> : <div className="p-4 text-xs text-muted">Statement executed. No result set.</div>}
          </>
        )}
      </div>
    </div>
  )
}
