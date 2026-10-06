import { useEffect, useRef, useState } from 'react'
import { Check, ChevronUp, Database, Plug, Plus, Unplug } from 'lucide-react'
import { ENGINES } from '../lib/engines'
import { ENV_BAR } from '../database/ConnectionList'
import { ctx } from '../database/actions'
import { useApp } from '../store/app'

/** Closes on outside click / Escape; opens upward because it lives in the status bar. */
function Popup({ label, button, children, wide = 300 }: { label: string; button: React.ReactNode; children: (close: () => void) => React.ReactNode; wide?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', down); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div ref={ref} className="relative h-full">
      <button aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(!open)}
        className={`flex h-full items-center gap-1.5 px-2 hover:bg-raised hover:text-fg ${open ? 'bg-raised text-fg' : ''}`}>{button}<ChevronUp size={11} className={open ? '' : 'rotate-180'} /></button>
      {open && <div role="menu" className="absolute bottom-full left-0 z-[80] mb-px max-h-[60vh] overflow-auto rounded-t-lg border border-b-0 border-line bg-raised py-1 text-xs shadow-2xl" style={{ width: wide }}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

const Head = ({ children }: { children: React.ReactNode }) => <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted">{children}</div>

/** Footer connection switcher: pick any saved connection (connects it if needed), disconnect, or add one. */
export function ConnectionSwitcher() {
  const st = useApp()
  const conn = st.connections.find((c) => c.id === st.activeConnId && st.sessions[c.id])
  const [busy, setBusy] = useState<string | null>(null)
  const env = conn ? ENV_BAR[conn.environment] : undefined
  const pick = async (id: string, close: () => void) => {
    close(); setBusy(id)
    try { await st.switchConnection(id) } catch (e) { st.toast('error', (e as Error).message ?? String(e)) }
    setBusy(null)
  }
  return (
    <Popup label="Switch connection" button={
      conn ? (
        <><span className={`h-3 w-[3px] rounded ${env!.bar}`} aria-hidden /><span>{ENGINES[conn.engine].label}</span><span className="font-medium text-fg">{conn.name}</span>{conn.environment === 'production' && <span className="font-bold text-danger">⚠ PRODUCTION</span>}</>
      ) : <><Plug size={12} /><span>{busy ? 'Connecting…' : 'No connection'}</span></>
    }>
      {(close) => (
        <>
          <Head>Connections</Head>
          {st.connections.map((c) => {
            const connected = !!st.sessions[c.id]
            return (
              <button key={c.id} role="menuitem" onClick={() => pick(c.id, close)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/15">
                <span className={`h-5 w-[3px] shrink-0 rounded ${ENV_BAR[c.environment].bar}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5"><span className="truncate font-medium">{c.name}</span>{connected && <span className="text-[10px] text-ok">● connected</span>}</span>
                  <span className="code block truncate !text-[11px] text-muted">{ENGINES[c.engine].fileBased ? c.filePath : `${c.host}:${c.port}`} · {ENV_BAR[c.environment].label}</span>
                </span>
                {c.id === st.activeConnId && connected && <Check size={13} className="text-accent" />}
              </button>
            )
          })}
          {!st.connections.length && <div className="px-3 py-2 text-muted">No saved connections.</div>}
          <div className="my-1 border-t border-line" />
          <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/15" onClick={() => { close(); st.setDialog({ type: 'connection' }) }}><Plus size={13} />New connection…</button>
          <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/15" onClick={() => { close(); useApp.setState({ connList: true, leftPanel: 'database', showLeft: true }) }}><Database size={13} />Manage connections</button>
          {conn && <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-danger hover:bg-danger/10" onClick={async () => { close(); await st.disconnect(conn.id) }}><Unplug size={13} />Disconnect {conn.name}</button>}
        </>
      )}
    </Popup>
  )
}

/** Footer database (or schema) switcher for the active connection. New queries run against the chosen one. */
export function DatabaseSwitcher() {
  const st = useApp()
  const conn = st.connections.find((c) => c.id === st.activeConnId && st.sessions[c.id])
  const [list, setList] = useState<string[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { setList(null); setErr('') }, [conn?.id, st.sessions[conn?.id ?? '']?.sessionId])
  if (!conn || ENGINES[conn.engine].fileBased) return null
  const current = st.selectedNs[conn.id] ?? conn.database
  const load = () => { if (!list) ctx(conn.id).intro.namespaces().then(setList, (e) => setErr((e as Error).message ?? String(e))) }
  const sys = ENGINES[conn.engine].systemDatabases
  const ordered = list ? [...list.filter((n) => !sys.includes(n)), ...list.filter((n) => sys.includes(n))] : []
  return (
    <div onMouseEnter={load} onFocus={load}>
      <Popup label={`Switch ${ENGINES[conn.engine].namespace.toLowerCase()}`} wide={260} button={<><Database size={12} /><span className={current ? 'font-medium text-fg' : ''}>{current || `select ${ENGINES[conn.engine].namespace.toLowerCase()}`}</span></>}>
        {(close) => (
          <>
            <Head>{ENGINES[conn.engine].namespace}s</Head>
            {err && <div className="px-3 py-2 text-danger">{err}</div>}
            {!list && !err && <div className="px-3 py-2 text-muted">Loading…</div>}
            {ordered.map((n) => (
              <button key={n} role="menuitem" className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-accent/15" onClick={() => { close(); void st.selectDatabase(conn.id, n) }}>
                <span className={`code ${sys.includes(n) ? 'text-muted' : ''}`}>{n}</span>{n === current && <Check size={13} className="text-accent" />}
              </button>
            ))}
          </>
        )}
      </Popup>
    </div>
  )
}
