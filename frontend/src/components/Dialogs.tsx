import { useState } from 'react'
import { AlertTriangle, FolderOpen } from 'lucide-react'
import { bridge, type ConnectionConfig } from '../bridge'
import { ENGINE_LIST, ENGINES, type EngineId, type Environment } from '../lib/engines'
import { uid, useApp } from '../store/app'
import { Field, Modal } from './ui'

export function ConfirmDialog({ d }: { d: Extract<NonNullable<ReturnType<typeof useApp.getState>['dialog']>, { type: 'confirm' }> }) {
  return (
    <Modal title={d.title} onClose={() => d.resolve(false)} banner={d.banner}>
      <div className="space-y-3 p-4 text-sm">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-warn" size={18} />
          <div>
            <p>{d.body}</p>
            {d.detail && d.detail.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-muted">{d.detail.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn" autoFocus onClick={() => d.resolve(false)}>Cancel</button>
          <button className={`btn ${d.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => d.resolve(true)}>{d.confirmLabel}</button>
        </div>
      </div>
    </Modal>
  )
}

export function PromptDialog({ d }: { d: Extract<NonNullable<ReturnType<typeof useApp.getState>['dialog']>, { type: 'prompt' }> }) {
  const [v, setV] = useState(d.initial ?? '')
  const ok = v.trim().length > 0
  return (
    <Modal title={d.title} onClose={() => d.resolve(null)} width="max-w-md">
      <form className="space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); if (ok) d.resolve(v.trim()) }}>
        <Field label={d.label}><input className="input code" autoFocus value={v} placeholder={d.placeholder} onChange={(e) => setV(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => d.resolve(null)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!ok}>{d.confirmLabel}</button>
        </div>
      </form>
    </Modal>
  )
}

const blank = (engine: EngineId = 'mysql'): ConnectionConfig => ({
  id: uid(), name: '', group: 'LOCAL', environment: 'local', engine, host: '127.0.0.1', port: ENGINES[engine].defaultPort,
  username: ENGINES[engine].defaultUser, database: '', filePath: '', ssl: false, sshEnabled: false, sshHost: '', sshPort: 22, sshUser: '', timeoutSeconds: 10,
})

export function ConnectionDialog({ editId, engine }: { editId?: string; engine?: EngineId }) {
  const { connections, saveConnection, connect, setDialog, toast } = useApp()
  const [c, setC] = useState<ConnectionConfig>(() => connections.find((x) => x.id === editId) ?? blank(engine))
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const eng = ENGINES[c.engine]
  const set = <K extends keyof ConnectionConfig>(k: K, v: ConnectionConfig[K]) => setC((p) => ({ ...p, [k]: v }))
  const valid = c.name.trim() && (eng.fileBased ? c.filePath.trim() || bridge().kind === 'demo' : c.host.trim() && c.port > 0)

  const changeEngine = (e: EngineId) => setC((p) => ({ ...p, engine: e, port: ENGINES[e].defaultPort, username: p.username === ENGINES[p.engine].defaultUser ? ENGINES[e].defaultUser : p.username }))
  const test = async () => {
    setBusy(true); setStatus(null)
    try {
      const r = await bridge().db.testConnection({ ...c, password })
      setStatus({ ok: r.ok, text: r.ok ? `${r.message}${r.serverVersion ? ` (${r.serverVersion})` : ''}` : r.message })
    } catch (e) { setStatus({ ok: false, text: (e as Error).message ?? String(e) }) }
    setBusy(false)
  }
  const persist = async () => { await saveConnection(c, password || undefined) }
  const doSave = async () => { await persist(); toast('success', 'Connection saved'); setDialog(null) }
  const doConnect = async () => {
    setBusy(true)
    try { await persist(); await connect(c.id, password); setDialog(null) }
    catch (e) { setStatus({ ok: false, text: (e as Error).message ?? String(e) }) }
    setBusy(false)
  }

  return (
    <Modal title={editId ? 'Edit connection' : 'New connection'} onClose={() => setDialog(null)} width="max-w-2xl" banner={c.environment === 'production' ? 'PRODUCTION DATABASE' : undefined}>
      <div className="grid grid-cols-2 gap-3 p-4">
        {bridge().kind === 'demo' && <p className="col-span-2 rounded-md border border-accent/40 bg-accent/10 p-2 text-xs">Browser demo: every connection opens the built-in sample database (SQLite). Install the desktop app to reach real servers.</p>}
        <Field label="Database engine">
          <select className="input" value={c.engine} onChange={(e) => changeEngine(e.target.value as EngineId)}>{ENGINE_LIST.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
        </Field>
        <Field label="Connection name"><input className="input" autoFocus value={c.name} onChange={(e) => set('name', e.target.value)} placeholder="MySQL Local" /></Field>
        <Field label="Group"><input className="input" value={c.group} onChange={(e) => set('group', e.target.value.toUpperCase())} placeholder="LOCAL" list="groups" />
          <datalist id="groups">{[...new Set([...connections.map((x) => x.group), 'LOCAL', 'DEVELOPMENT', 'PRODUCTION'])].map((g) => <option key={g} value={g} />)}</datalist></Field>
        <Field label="Environment">
          <select className="input" value={c.environment} onChange={(e) => set('environment', e.target.value as Environment)}>
            <option value="local">LOCAL</option><option value="development">DEVELOPMENT</option><option value="staging">STAGING</option><option value="production">PRODUCTION</option>
          </select>
        </Field>
        {eng.fileBased ? (
          <div className="col-span-2">
            <Field label="Database file">
              <div className="flex gap-2">
                <input className="input code" value={c.filePath} onChange={(e) => set('filePath', e.target.value)} placeholder="C:\data\app.db" />
                <button type="button" className="btn" onClick={async () => { const f = await bridge().fs.pickFile(); if (f) set('filePath', f) }}><FolderOpen size={14} />Browse</button>
              </div>
            </Field>
          </div>
        ) : (
          <>
            <Field label="Host"><input className="input code" value={c.host} onChange={(e) => set('host', e.target.value)} /></Field>
            <Field label="Port"><input className="input code" type="number" min={1} max={65535} value={c.port} onChange={(e) => set('port', Number(e.target.value))} /></Field>
            <Field label="Username"><input className="input code" value={c.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" /></Field>
            <Field label="Password" hint="Stored in your operating system keychain, never in the app files or on the server.">
              <input className="input code" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={editId ? '(unchanged)' : ''} />
            </Field>
            <Field label={c.engine === 'postgres' ? 'Database' : 'Default database'}><input className="input code" value={c.database} onChange={(e) => set('database', e.target.value)} /></Field>
            <Field label="Connection timeout (seconds)"><input className="input code" type="number" min={1} value={c.timeoutSeconds} onChange={(e) => set('timeoutSeconds', Number(e.target.value))} /></Field>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={c.ssl} onChange={(e) => set('ssl', e.target.checked)} /> Use SSL / TLS</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={c.sshEnabled} onChange={(e) => set('sshEnabled', e.target.checked)} /> Connect through SSH tunnel</label>
            {c.sshEnabled && (
              <>
                <Field label="SSH host"><input className="input code" value={c.sshHost} onChange={(e) => set('sshHost', e.target.value)} /></Field>
                <Field label="SSH port"><input className="input code" type="number" value={c.sshPort} onChange={(e) => set('sshPort', Number(e.target.value))} /></Field>
                <Field label="SSH user" hint="Authentication uses your SSH agent / keys; private keys are never read into the UI."><input className="input code" value={c.sshUser} onChange={(e) => set('sshUser', e.target.value)} /></Field>
              </>
            )}
          </>
        )}
        {status && <p role="status" className={`col-span-2 rounded-md border p-2 text-xs ${status.ok ? 'border-ok/50 text-ok' : 'border-danger/50 text-danger'}`}>{status.ok ? '✓ ' : '✕ '}{status.text}</p>}
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <button className="btn" disabled={!valid || busy} onClick={test}>Test Connection</button>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
          <button className="btn" disabled={!valid || busy} onClick={doSave}>Save Connection</button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={doConnect}>Connect</button>
        </div>
      </div>
    </Modal>
  )
}

export function CloneDialog() {
  const { setDialog, toast, openProject } = useApp()
  const [url, setUrl] = useState('')
  const [dest, setDest] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const kind = /^git@|^ssh:\/\//.test(url) ? 'SSH' : 'HTTPS'
  const credsInUrl = /^https?:\/\/[^/]*@/.test(url)
  const valid = /^(https:\/\/|git@|ssh:\/\/)\S+$/.test(url) && dest.trim() && !credsInUrl

  const go = async () => {
    setBusy(true); setErr('')
    try {
      const name = url.replace(/\.git$/, '').split(/[/:]/).pop() || 'repo'
      const target = dest.replace(/[\\/]+$/, '') + '/' + name
      await bridge().git.clone(url, target)
      await openProject(target)
      toast('success', 'Repository cloned')
      setDialog(null)
    } catch (e) { setErr((e as Error).message ?? String(e)) }
    setBusy(false)
  }
  return (
    <Modal title="Clone Repository" onClose={() => setDialog(null)}>
      <div className="space-y-3 p-4">
        <Field label="Repository URL" hint={`Authentication: ${kind}. Credentials are handled by your Git credential helper / SSH agent.`}>
          <input className="input code" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/user/project.git or git@github.com:user/project.git" />
        </Field>
        {credsInUrl && <p className="text-xs text-danger">Remove the username/token from the URL; use a credential helper instead.</p>}
        <Field label="Destination">
          <div className="flex gap-2">
            <input className="input code" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Parent folder" />
            <button className="btn" onClick={async () => { const f = await bridge().fs.pickFolder(); if (f) setDest(f) }}><FolderOpen size={14} />Browse</button>
          </div>
        </Field>
        {err && <p className="whitespace-pre-wrap rounded-md border border-danger/50 p-2 text-xs text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={go}>{busy ? 'Cloning…' : 'Clone Repository'}</button>
        </div>
      </div>
    </Modal>
  )
}

export function AboutDialog() {
  const { setDialog } = useApp()
  return (
    <Modal title="About MySQL Forge Studio" onClose={() => setDialog(null)} width="max-w-md">
      <div className="space-y-3 p-5 text-sm">
        <h3 className="text-lg font-semibold">MySQL Forge Studio</h3>
        <p className="text-muted">Version 1.0.0 · Built for developers.</p>
        <p className="text-xs text-muted">Django · React · Tauri · Rust · Monaco Editor · MySQL, MariaDB, PostgreSQL, SQLite, SQL Server</p>
        <div className="flex gap-2">
          <a className="btn" href="https://github.com/Asda168/sql-tool" target="_blank" rel="noreferrer">GitHub</a>
          <a className="btn" href="/docs" target="_blank" rel="noreferrer">Documentation</a>
          <a className="btn" href="https://github.com/Asda168/sql-tool/issues" target="_blank" rel="noreferrer">Report Issue</a>
        </div>
      </div>
    </Modal>
  )
}
