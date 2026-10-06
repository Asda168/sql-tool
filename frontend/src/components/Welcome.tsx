import { Database, FolderOpen, GitFork } from 'lucide-react'
import { bridge } from '../bridge'
import { useApp } from '../store/app'
import { Logo } from './Logo'

export default function Welcome() {
  const st = useApp()
  const openProject = async () => { const p = await bridge().fs.pickFolder(); if (p) { await st.openProject(p); st.finishFirstRun() } }
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-8">
      <div className="w-full max-w-xl text-center">
        <Logo className="mx-auto mb-4 h-16 w-16" />
        <h1 className="text-2xl font-semibold">Welcome to MySQL Forge Studio</h1>
        <p className="mt-2 text-sm text-muted">Connect your database. Open a project. Start writing SQL.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button className="btn btn-primary justify-center py-3" onClick={() => { st.setDialog({ type: 'connection' }); st.finishFirstRun() }}><Database size={15} />Connect MySQL</button>
          <button className="btn justify-center py-3" onClick={openProject}><FolderOpen size={15} />Open Project</button>
          <button className="btn justify-center py-3" onClick={() => st.setDialog({ type: 'clone' })}><GitFork size={15} />Clone Repository</button>
        </div>
        {bridge().kind === 'demo' && <button className="btn mt-4" onClick={async () => { const id = crypto.randomUUID(); await st.saveConnection({ id, name: 'Demo Database', group: 'LOCAL', environment: 'local', engine: 'sqlite', host: '', port: 0, username: '', database: '', filePath: ':memory:', ssl: false, sshEnabled: false, sshHost: '', sshPort: 22, sshUser: '', timeoutSeconds: 10 }); await st.connect(id); await st.openProject(await bridge().fs.homeDir()); st.newSqlTab("SELECT id, name, email\nFROM users\nWHERE status = 'active'\nORDER BY created_at DESC\nLIMIT 50;\n"); st.finishFirstRun() }}>Try the demo database</button>}
        <div className="mt-8 grid grid-cols-3 gap-3 text-left text-xs text-muted">
          <div><div className="mb-1 font-semibold text-fg">Theme</div>{st.settings.theme}</div>
          <div><div className="mb-1 font-semibold text-fg">Font</div>{st.settings.fontFamily} {st.settings.fontSize}px</div>
          <div><div className="mb-1 font-semibold text-fg">Terminal</div>{st.settings.terminalShell}</div>
        </div>
        <button className="mt-4 text-xs text-accent underline" onClick={() => st.openTab({ id: 'settings', kind: 'settings', title: 'Settings' })}>Change settings</button>
      </div>
    </div>
  )
}
