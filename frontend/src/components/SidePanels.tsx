import { useState } from 'react'
import { Copy, Pencil, Play, Search, Trash2 } from 'lucide-react'
import { bridge } from '../bridge'
import { useApp, type HistoryItem } from '../store/app'
import { Empty } from './ui'

const dayLabel = (iso: string) => {
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000)
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString()
}

export function HistoryPanel() {
  const st = useApp()
  const [q, setQ] = useState('')
  const items = st.history.filter((h) => !q || h.sql.toLowerCase().includes(q.toLowerCase()))
  const groups = items.reduce<Record<string, HistoryItem[]>>((m, h) => { (m[dayLabel(h.at)] ||= []).push(h); return m }, {})
  const edit = (h: HistoryItem) => { const id = st.newSqlTab(h.sql); st.updateTab(id, { connId: h.connId }); return id }
  const rerun = (h: HistoryItem) => { const id = edit(h); setTimeout(() => void useApp.getState().runSql(id, 'all'), 0) }
  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <Search size={12} className="text-muted" /><input aria-label="Search history" className="flex-1 bg-transparent outline-none" placeholder="Search history…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={!st.history.length} onClick={async () => { if (await st.confirm({ title: 'Clear history', body: 'Delete all query history on this computer?', confirmLabel: 'Clear', danger: true })) st.clearHistory() }}>Clear</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {Object.entries(groups).map(([day, hs]) => (
          <div key={day}>
            <div className="sticky top-0 bg-panel px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{day}</div>
            {hs.map((h) => (
              <div key={h.id} className="group border-b border-line/50 px-3 py-1.5 hover:bg-raised">
                <div className="code truncate" title={h.sql}>{h.sql.replace(/\s+/g, ' ')}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                  <span className={h.status === 'success' ? 'text-ok' : 'text-danger'}>{h.status === 'success' ? '✓' : '✕'} {h.status}</span>
                  <span>{h.connName}</span><span>{h.ms} ms</span><span>{new Date(h.at).toLocaleTimeString()}</span>
                  <span className="ml-auto hidden gap-1 group-hover:flex">
                    <button aria-label="Re-run" title="Re-run" onClick={() => rerun(h)}><Play size={12} /></button>
                    <button aria-label="Edit" title="Open in editor" onClick={() => edit(h)}><Pencil size={12} /></button>
                    <button aria-label="Copy" title="Copy" onClick={() => void navigator.clipboard?.writeText(h.sql)}><Copy size={12} /></button>
                    <button aria-label="Save query" title="Save query" onClick={() => st.setDialog({ type: 'save-query', sql: h.sql })}>★</button>
                    <button aria-label="Delete" title="Delete" className="hover:text-danger" onClick={() => st.deleteHistory(h.id)}><Trash2 size={12} /></button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
        {!items.length && <Empty>No queries yet. Run one and it appears here.</Empty>}
        {st.saved.length > 0 && (
          <div>
            <div className="sticky top-0 bg-panel px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Saved queries</div>
            {st.saved.map((s) => (
              <div key={s.id} className="group flex items-center gap-2 border-b border-line/50 px-3 py-1.5 hover:bg-raised">
                <button className="min-w-0 flex-1 truncate text-left" title={s.sql} onClick={() => st.newSqlTab(s.sql, `${s.title}.sql`)}>★ {s.title}</button>
                <button aria-label="Delete saved query" className="hidden hover:text-danger group-hover:block" onClick={() => st.deleteSaved(s.id)}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function SearchPanel() {
  const st = useApp()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ path: string; line: number; preview: string }[] | null>(null)
  const go = async () => { if (st.projectPath && q.trim()) setHits(await bridge().fs.search(st.projectPath, q.trim()).catch(() => [])) }
  if (!st.projectPath) return <Empty>Open a project to search its files.</Empty>
  return (
    <div className="flex h-full flex-col text-xs">
      <div className="border-b border-line p-2"><input aria-label="Find in files" className="input" placeholder="Find in files (Enter)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></div>
      <div className="min-h-0 flex-1 overflow-auto">
        {hits?.map((h, i) => <button key={i} className="block w-full px-3 py-1 text-left hover:bg-raised" onClick={() => void st.openFile(h.path)}><div className="truncate font-semibold">{h.path.replace(st.projectPath!, '').replace(/^[\\/]/, '')}:{h.line}</div><div className="code truncate text-muted">{h.preview}</div></button>)}
        {hits && !hits.length && <Empty>No results.</Empty>}
        {hits && hits.length >= 500 && <Empty>Showing the first 500 matches.</Empty>}
      </div>
    </div>
  )
}
