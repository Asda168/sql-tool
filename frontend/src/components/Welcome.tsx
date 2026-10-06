import { Database, FolderOpen, GitFork, Link2, Plug, Plus } from 'lucide-react'
import { bridge } from '../bridge'
import { parseConnectionUrl } from '../lib/connectionUrl'
import { timeAgo } from '../lib/time'
import { mod } from '../lib/os'
import { useApp } from '../store/app'
import { ENV_BAR } from '../database/ConnectionList'
import { Logo } from './Logo'

/** Empty workspace: lots of negative space, three clear actions, then recent items. */
export default function Welcome() {
  const st = useApp()
  const first = !st.firstRunDone
  const openProject = async () => { const p = await bridge().fs.pickFolder(); if (p) { await st.openProject(p); st.finishFirstRun() } }
  const importUrl = async () => {
    const url = await st.prompt({ title: 'Import Connection URL', label: 'URL (mysql://user:password@host:3306/database)', placeholder: 'mysql://root@127.0.0.1:3306', confirmLabel: 'Import' })
    if (!url) return
    const draft = parseConnectionUrl(url)
    if (!draft) return st.toast('error', 'That does not look like a mysql://, mariadb://, postgres:// or sqlite:// URL.')
    st.setDialog({ type: 'connection', initial: draft })
  }
  const recentConns = st.connections.filter((c) => st.lastUsed[c.id]).sort((a, b) => st.lastUsed[b.id].localeCompare(st.lastUsed[a.id])).slice(0, 4)
  const connect = async (id: string) => { try { await st.connect(id) } catch (e) { st.toast('error', (e as Error).message ?? String(e)) } }

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-editor p-10">
      <div className="w-full max-w-lg">
        <div className="mb-10 text-center">
          <Logo className="mx-auto mb-5 h-14 w-14" />
          <div className="text-[11px] font-semibold uppercase tracking-[0.4em] text-muted">MySQL Forge Studio</div>
          <h1 className="mt-4 text-[22px] font-medium">{first ? 'Build your workspace.' : 'Welcome to MySQL Forge Studio'}</h1>
          <p className="mt-2 text-[13px] text-muted">Connect to a database or open a project to get started.</p>
          <p className="mt-1 text-[11px] text-muted/70">Write SQL. Manage Code. Connect. Build.</p>
        </div>

        <div className="mx-auto grid max-w-md gap-2">
          <button className="flex h-10 items-center justify-center gap-2 rounded-md border border-accent bg-accent/10 text-[13px] font-medium text-accent hover:bg-accent/20" onClick={() => { st.setDialog({ type: 'connection' }); st.finishFirstRun() }}><Plus size={15} />{first ? 'Connect Database' : 'New Connection'}</button>
          <div className="grid grid-cols-2 gap-2">
            <button className="flex h-9 items-center justify-center gap-2 rounded-md border border-line text-xs hover:border-accent/50 hover:bg-raised" onClick={importUrl}><Link2 size={14} />Import Connection URL</button>
            <button className="flex h-9 items-center justify-center gap-2 rounded-md border border-line text-xs hover:border-accent/50 hover:bg-raised" onClick={openProject}><FolderOpen size={14} />Open Project</button>
          </div>
          <button className="flex h-9 items-center justify-center gap-2 rounded-md border border-line text-xs hover:border-accent/50 hover:bg-raised" onClick={() => st.setDialog({ type: 'clone' })}><GitFork size={14} />Clone Repository</button>
        </div>

        {(recentConns.length > 0 || st.recentProjects.length > 0) && (
          <div className="mx-auto mt-10 max-w-md">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">Recent</div>
            <div className="divide-y divide-line/60 rounded-md border border-line">
              {recentConns.map((c) => (
                <button key={c.id} className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-raised" onClick={() => connect(c.id)}>
                  <span className={`h-4 w-[3px] rounded ${ENV_BAR[c.environment].bar}`} aria-hidden /><Database size={13} className="text-muted" />
                  <span className="flex-1 truncate">{c.name}</span><span className="text-[11px] text-muted">{timeAgo(st.lastUsed[c.id])}</span>
                </button>
              ))}
              {st.recentProjects.slice(0, 3).map((p) => (
                <button key={p} className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-raised" onClick={() => st.openProject(p)}>
                  <span className="h-4 w-[3px]" /><FolderOpen size={13} className="text-muted" /><span className="flex-1 truncate">{p.split(/[\\/]/).filter(Boolean).pop()}</span><span className="text-[11px] text-muted">project</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] text-muted">
          <div className="flex justify-between"><span>Command palette</span><kbd className="code !text-[11px]">{mod()}+Shift+P</kbd></div>
          <div className="flex justify-between"><span>Quick open</span><kbd className="code !text-[11px]">{mod()}+P</kbd></div>
          <div className="flex justify-between"><span>New query</span><kbd className="code !text-[11px]">{mod()}+T</kbd></div>
          <div className="flex justify-between"><span>Terminal</span><kbd className="code !text-[11px]">{mod()}+`</kbd></div>
        </div>
        {bridge().kind === 'demo' && <p className="mx-auto mt-8 flex max-w-md items-center gap-2 rounded-md border border-warn/40 bg-warn/10 p-2.5 text-[11px] text-warn"><Plug size={13} />Browser demo: connections open a built-in sample database. Use the desktop app for real servers.</p>}
        {bridge().kind === 'demo' && <button className="btn mx-auto mt-3 flex" onClick={async () => { const id = crypto.randomUUID(); await st.saveConnection({ id, name: 'Demo Database', group: 'LOCAL', environment: 'local', engine: 'sqlite', host: '', port: 0, username: '', database: '', filePath: ':memory:', ssl: false, sshEnabled: false, sshHost: '', sshPort: 22, sshUser: '', timeoutSeconds: 10 }); await st.connect(id); await st.openProject(await bridge().fs.homeDir()); st.newSqlTab("SELECT id, name, email\nFROM users\nWHERE status = 'active'\nORDER BY created_at DESC\nLIMIT 50;\n"); st.finishFirstRun() }}>Try the demo database</button>}
      </div>
    </div>
  )
}
