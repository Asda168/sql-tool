import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, Database, Plus, Unplug } from 'lucide-react'
import SearchBox from '../components/SearchBox'
import { openTableData } from './tableMenu'
import { ENGINES } from '../lib/engines'
import { fuzzyScore } from '../lib/sqlContext'
import { EnvBadge } from '../components/ui'
import { useApp } from '../store/app'
import ConnectionList, { ENV_BAR } from './ConnectionList'
import { TableNode } from './DbExplorer'
import SchemaTree from './SchemaTree'

/** Dropdown to switch the active database. Lists user databases first, system ones dimmed. */
function DatabaseSwitch({ connId, names, active }: { connId: string; names: string[]; active?: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const engine = useApp((s) => s.sessions[connId]?.engine ?? 'mysql')
  const sys = ENGINES[engine].systemDatabases
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', down); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [open])
  const list = useMemo(() => {
    const ranked = names.map((n) => ({ n, sc: fuzzyScore(q.trim(), n) })).filter((x) => x.sc >= 0)
    return (q.trim() ? ranked.sort((a, b) => b.sc - a.sc) : ranked).map((x) => x.n)
  }, [names, q])
  const noun = ENGINES[engine].namespace.toLowerCase()
  const pick = (n: string) => { setOpen(false); setQ(''); void useApp.getState().selectDatabase(connId, n, false) }
  return (
    <div ref={ref} className="relative px-3 pt-2.5">
      <button aria-haspopup="listbox" aria-expanded={open} aria-label={`Switch ${noun}`} onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-left text-[13px] hover:border-accent/60">
        <Database size={14} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate font-medium">{active ?? `Select a ${noun}`}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted">switch</span>
        <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" className="absolute inset-x-3 top-full z-30 mt-1 overflow-hidden rounded-lg border border-line bg-raised shadow-2xl">
          <div className="border-b border-line p-1.5"><SearchBox autoFocus label={`Filter ${noun}s`} placeholder={`Filter ${noun}s…`} value={q} onChange={setQ} onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) pick(list[0]) }} /></div>
          <div className="max-h-72 overflow-auto py-1">
            {list.map((n) => (
              <button key={n} role="option" aria-selected={n === active} onClick={() => pick(n)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/15">
                <span className={`code min-w-0 flex-1 truncate ${sys.includes(n) ? 'text-muted' : ''}`}>{n}</span>{n === active && <Check size={13} className="shrink-0 text-accent" />}
              </button>
            ))}
            {!list.length && <div className="px-3 py-2 text-xs text-muted">No match.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function Explorer({ id }: { id: string }) {
  const cfg = useApp((s) => s.connections.find((c) => c.id === id))!
  const engine = useApp((s) => s.sessions[id]?.engine ?? 'mysql')
  const namespaces = useApp((s) => s.namespaces[id])
  const active = useApp((s) => s.selectedNs[id])
  const cache = useApp((s) => s.schemaCache[id])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const env = ENV_BAR[cfg.environment]
  const sys = ENGINES[engine].systemDatabases
  const ordered = useMemo(() => [...(namespaces ?? []).filter((n) => !sys.includes(n)), ...(namespaces ?? []).filter((n) => sys.includes(n))], [namespaces, sys])
  const current = active && ordered.includes(active) ? active : undefined
  const noun = ENGINES[engine].namespace

  useEffect(() => { if (!namespaces) void useApp.getState().refreshSchema(id) }, [id, namespaces])

  // table search across the databases whose schema is loaded (the selected one ranks first)
  const hits = useMemo(() => {
    if (!q.trim() || !cache) return []
    return Object.entries(cache).flatMap(([ns, info]) => Object.entries(info.tables).map(([t, v]) => ({ ns, t, kind: v.kind, sc: fuzzyScore(q.trim(), t) + (ns === current ? 40 : 0) }))).filter((h) => h.sc >= 40 || (h.sc >= 0 && h.ns !== current)).sort((a, b) => b.sc - a.sc).slice(0, 100)
  }, [q, cache, current])

  return (
    <div className="flex h-full flex-col">
      <div className="relative border-b border-line px-3 py-2.5 pl-4">
        <span className={`absolute inset-y-2 left-1 w-[3px] rounded ${env.bar}`} aria-hidden />
        <div className="flex items-center gap-2">
          <button className="rounded p-1 text-muted hover:bg-raised hover:text-fg" title="All connections" aria-label="Back to connections" onClick={() => useApp.getState().setConnList(true)}><ArrowLeft size={14} /></button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Connection</div>
            <div className="flex items-center gap-2"><span className="truncate text-[13px] font-medium">{cfg.name}</span><EnvBadge env={cfg.environment} /></div>
            <div className="code truncate !text-[11px] text-muted">{ENGINES[cfg.engine].label} · {ENGINES[cfg.engine].fileBased ? cfg.filePath : `${cfg.host}:${cfg.port}`}</div>
          </div>
          <button className="rounded p-1 text-muted hover:bg-raised hover:text-fg" title="New query" aria-label="New query" onClick={() => { const s = useApp.getState(); const t = s.newSqlTab(''); s.updateTab(t, { connId: id }) }}><Plus size={14} /></button>
          <button className="rounded p-1 text-muted hover:bg-raised hover:text-danger" title="Disconnect" aria-label="Disconnect" onClick={async () => { await useApp.getState().disconnect(id); useApp.getState().setConnList(true) }}><Unplug size={14} /></button>
        </div>
      </div>

      {!ENGINES[engine].fileBased && <DatabaseSwitch connId={id} names={ordered} active={current} />}

      {current ? (
        <>
          <div className="px-3 pt-2">
            <SearchBox label="Search tables" placeholder={`Search tables in ${current}…`} value={q} onChange={(v) => { setQ(v); setSel(0) }}
              count={q.trim() ? `${hits.length}${hits.length === 100 ? '+' : ''}` : undefined}
              onKeyDown={(e) => {
                if (!q.trim() || !hits.length) return
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(hits.length - 1, i + 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)) }
                else if (e.key === 'Enter') { e.preventDefault(); const h = hits[Math.min(sel, hits.length - 1)]; if (h) openTableData(id, h.ns, h.t) }
              }} />
          </div>
          <div className="mt-2 min-h-0 flex-1">
            {q.trim() ? (
              <div role="listbox" aria-label="Search results" className="relative h-full overflow-auto px-2 pb-2">
                {hits.map((h, i) => (
                  <TableNode key={h.ns + '.' + h.t} connId={id} ns={h.ns} t={{ name: h.t, kind: h.kind }} query={q} active={i === Math.min(sel, hits.length - 1)} subtitle={h.ns !== current ? h.ns : undefined} onChanged={() => void useApp.getState().loadNs(id, h.ns, true)} />
                ))}
                {!hits.length && (
                  <div className="flex flex-col items-center gap-1 px-4 py-8 text-center text-xs text-muted">
                    <span className="text-fg">No tables match “{q.trim()}”</span>
                    <span>Check the spelling, or switch to another {noun.toLowerCase()}.</span>
                  </div>
                )}
                {hits.length > 0 && <div className="px-3 pt-2 text-[10px] text-muted">↑↓ to move · Enter to open · Esc to clear · right-click for more</div>}
              </div>
            ) : <SchemaTree connId={id} ns={current} />}
          </div>
        </>
      ) : (
        <>
          <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted">{noun}s{namespaces ? ` · ${namespaces.length}` : ''}</div>
          <div role="listbox" aria-label={`${noun}s`} className="min-h-0 flex-1 overflow-auto px-1 pb-2">
            {!namespaces && <div className="px-3 py-2 text-xs text-muted">Loading…</div>}
            {ordered.map((n) => (
              <button key={n} role="option" aria-selected={false} className="flex h-7 w-full items-center gap-2 rounded px-3 text-left text-xs hover:bg-raised" onClick={() => void useApp.getState().selectDatabase(id, n, false)}>
                <Database size={13} className={sys.includes(n) ? 'text-muted' : 'text-accent'} /><span className={`code truncate ${sys.includes(n) ? 'text-muted' : ''}`}>{n}</span>
              </button>
            ))}
            <p className="px-3 pt-3 text-[11px] text-muted">Choose a {noun.toLowerCase()} to browse its tables. Queries run in the one you pick.</p>
          </div>
        </>
      )}
    </div>
  )
}

/** Left "Database" view: the connection list, or the explorer of the active connection once connected. */
export default function DatabasePanel() {
  const activeConnId = useApp((s) => s.activeConnId)
  const sessionId = useApp((s) => (s.activeConnId ? s.sessions[s.activeConnId]?.sessionId : undefined))
  const connList = useApp((s) => s.connList)
  if (!connList && activeConnId && sessionId) return <Explorer id={activeConnId} key={activeConnId + sessionId} />
  return <ConnectionList />
}
