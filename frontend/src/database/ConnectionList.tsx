import { useMemo, useState } from 'react'
import { Link2, Play, Plug, Plus } from 'lucide-react'
import SearchBox from '../components/SearchBox'
import type { ConnectionConfig } from '../bridge'
import { ENGINES, type Environment } from '../lib/engines'
import { parseConnectionUrl } from '../lib/connectionUrl'
import { timeAgo } from '../lib/time'
import { uid, useApp } from '../store/app'
import { useContextMenu } from '../components/ui'
import { connectService, connectionFor, startService, useStacks } from '../store/stacks'

/** Environment indicator: a 3px bar (never the whole card) plus a text label, so colour is never the only signal. */
export const ENV_BAR: Record<Environment, { bar: string; text: string; label: string }> = {
  local: { bar: 'bg-blue-500', text: 'text-blue-400', label: 'LOCAL' },
  development: { bar: 'bg-teal-400', text: 'text-teal-300', label: 'DEVELOPMENT' },
  staging: { bar: 'bg-orange-500', text: 'text-orange-400', label: 'STAGING' },
  production: { bar: 'bg-red-500', text: 'text-red-400', label: '⚠ PRODUCTION' },
}

const addr = (c: ConnectionConfig) => (ENGINES[c.engine].fileBased ? c.filePath || '(file)' : `${c.host}:${c.port}`)

function Card({ c, connected, active, onOpen, onContext, sub }: { c: ConnectionConfig; connected: boolean; active: boolean; onOpen: () => void; onContext: (e: React.MouseEvent) => void; sub?: string }) {
  const env = ENV_BAR[c.environment]
  return (
    <button onClick={onOpen} onContextMenu={onContext} aria-label={`${c.name}, ${addr(c)}, ${env.label}${connected ? ', connected' : ''}`}
      className={`group relative flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 pl-4 text-left text-xs ${active ? 'border-accent/60 bg-accent/10' : 'border-line bg-bg/40 hover:border-line hover:bg-raised'}`}>
      <span className={`absolute inset-y-1.5 left-1 w-[3px] rounded ${env.bar}`} aria-hidden />
      <span className="flex w-full items-center gap-2">
        <span className="truncate text-[13px] font-medium">{c.name}</span>
        {connected && <span className="ml-auto flex items-center gap-1 text-[10px] text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />connected</span>}
      </span>
      <span className="code w-full truncate !text-[11px] text-muted">{sub ?? addr(c)}</span>
      <span className="mt-1 flex items-center gap-2 text-[10px] tracking-wide">
        <span className="rounded border border-line px-1 text-muted">{ENGINES[c.engine].label.toUpperCase()}</span>
        <span className={`font-semibold ${env.text}`}>{env.label}</span>
      </span>
    </button>
  )
}

export default function ConnectionList() {
  const st = useApp()
  const { stacks, busy: starting } = useStacks()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const { menu, open } = useContextMenu()
  const match = (c: ConnectionConfig) => !q.trim() || `${c.name} ${addr(c)} ${c.group}`.toLowerCase().includes(q.trim().toLowerCase())
  const saved = useMemo(() => st.connections.filter(match).sort((a, b) => a.name.localeCompare(b.name)), [st.connections, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useMemo(() => st.connections.filter((c) => st.lastUsed[c.id]).sort((a, b) => st.lastUsed[b.id].localeCompare(st.lastUsed[a.id])).slice(0, 5).filter(match), [st.connections, st.lastUsed, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const openConn = async (c: ConnectionConfig) => {
    if (st.sessions[c.id]) { st.setActiveConn(c.id); st.setConnList(false); return }
    setBusy(c.id)
    try { await st.connect(c.id) } catch (e) { st.toast('error', `${c.name}: ${(e as Error).message ?? e}`) }
    setBusy(null)
  }
  const menuFor = (c: ConnectionConfig) => (e: React.MouseEvent) => open(e, [
    st.sessions[c.id] ? { label: 'Disconnect', onClick: () => void st.disconnect(c.id) } : { label: 'Connect', onClick: () => void openConn(c) },
    { label: 'New SQL query', disabled: !st.sessions[c.id], onClick: () => { const t = st.newSqlTab(''); st.updateTab(t, { connId: c.id }) } },
    { sep: true, label: '', onClick: () => {} },
    { label: 'Edit…', onClick: () => st.setDialog({ type: 'connection', editId: c.id }) },
    { label: 'Duplicate', onClick: () => void st.saveConnection({ ...c, id: uid(), name: `${c.name} copy` }) },
    { label: 'Delete', danger: true, onClick: async () => { if (await st.confirm({ title: 'Delete connection', body: `Remove "${c.name}" and its saved password from the keychain?`, confirmLabel: 'Delete', danger: true })) void st.deleteConnection(c.id) } },
  ])

  const importUrl = async () => {
    const url = await st.prompt({ title: 'Import Connection URL', label: 'URL (mysql://user:password@host:3306/database)', placeholder: 'mysql://root@127.0.0.1:3306', confirmLabel: 'Import' })
    if (!url) return
    const draft = parseConnectionUrl(url)
    if (!draft) return st.toast('error', 'That does not look like a mysql://, mariadb://, postgres:// or sqlite:// URL.')
    st.setDialog({ type: 'connection', initial: draft })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <button className="flex h-[38px] w-full items-center justify-center gap-2 rounded-md border border-line bg-bg text-[13px] hover:border-accent/60 hover:bg-raised" onClick={() => st.setDialog({ type: 'connection' })}><Plus size={15} />New Connection</button>
        <SearchBox label="Filter connections" placeholder="Filter connections…" value={q} onChange={setQ} />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-3 pb-3">
        {stacks.length > 0 && (
          <section aria-label="Local servers">
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">Local servers</h3>
            <div className="space-y-1.5">
              {stacks.map((stack) => (
                <div key={stack.id} className="rounded-md border border-line bg-bg/40 text-xs">
                  <div className="flex items-center justify-between border-b border-line/60 px-3 py-1.5">
                    <span className="font-medium">{stack.name}</span>
                    <span className={`text-[10px] ${stack.managerRunning ? 'text-ok' : 'text-muted'}`}>{stack.managerRunning ? '● open' : stack.root ? 'installed' : 'running'}</span>
                  </div>
                  {stack.services.map((svc) => {
                    const conn = connectionFor(svc)
                    const connected = !!(conn && st.sessions[conn.id])
                    return (
                      <div key={svc.id} className="flex items-center gap-2 px-3 py-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${svc.running ? 'bg-ok' : 'bg-muted/50'}`} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{svc.name}{svc.version ? ` ${svc.version}` : ''}</div>
                          <div className="code !text-[11px] text-muted">127.0.0.1:{svc.port} · {svc.running ? 'running' : 'stopped'}</div>
                        </div>
                        {svc.running ? (
                          connected ? <span className="text-[10px] text-ok">connected</span>
                            : <button className="btn" onClick={() => void connectService(stack, svc)}><Plug size={12} />Connect</button>
                        ) : svc.canStart ? (
                          <button className="btn" disabled={starting[svc.id]} onClick={() => void startService(stack, svc)}><Play size={12} />{starting[svc.id] ? 'Starting…' : 'Start'}</button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        )}
        <section aria-label="Saved connections">
          <h3 className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted">Saved <span className="rounded bg-raised px-1.5 text-[10px]">{saved.length}</span></h3>
          <div className="space-y-1.5">
            {saved.map((c) => <Card key={c.id} c={c} connected={!!st.sessions[c.id]} active={st.activeConnId === c.id && !!st.sessions[c.id]} onOpen={() => openConn(c)} onContext={menuFor(c)} sub={busy === c.id ? 'Connecting…' : undefined} />)}
            {!saved.length && <p className="rounded-md border border-dashed border-line p-3 text-center text-xs text-muted">{st.connections.length ? 'No connections match.' : 'No saved connections yet.'}</p>}
          </div>
        </section>
        {recent.length > 0 && (
          <section aria-label="Recent connections">
            <h3 className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted">Recent <span className="rounded bg-raised px-1.5 text-[10px]">{recent.length}</span></h3>
            <div className="space-y-0.5">
              {recent.map((c) => (
                <button key={c.id} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-raised" onClick={() => openConn(c)} onContextMenu={menuFor(c)}>
                  <span className="truncate">{c.name}</span><span className="ml-2 shrink-0 text-[11px] text-muted">{timeAgo(st.lastUsed[c.id])}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        <button className="flex items-center gap-1.5 text-[11px] text-muted hover:text-fg" onClick={importUrl}><Link2 size={12} />Import connection URL…</button>
      </div>
      {menu}
    </div>
  )
}
