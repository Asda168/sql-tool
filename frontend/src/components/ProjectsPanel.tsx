import { FolderGit2, FolderOpen, GitFork, Plus } from 'lucide-react'
import { bridge } from '../bridge'
import { useApp } from '../store/app'
import FileExplorer from './FileExplorer'

const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

/** Left "Projects" view: recent projects and open/clone actions on top, the active project's file tree below. */
export default function ProjectsPanel() {
  const st = useApp()
  const open = async () => { const p = await bridge().fs.pickFolder(); if (p) await st.openProject(p) }
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Projects</div>
        <div className="grid grid-cols-2 gap-2">
          <button className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-line bg-bg text-xs hover:border-accent/60 hover:bg-raised" onClick={open}><Plus size={13} />Open Project</button>
          <button className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-line bg-bg text-xs hover:border-accent/60 hover:bg-raised" onClick={() => st.setDialog({ type: 'clone' })}><GitFork size={13} />Clone Repository</button>
        </div>
        <div className="max-h-36 space-y-0.5 overflow-auto">
          {st.recentProjects.map((p) => (
            <button key={p} title={p} onClick={() => st.openProject(p)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-raised ${p === st.projectPath ? 'bg-accent/10 text-accent' : ''}`}>
              <FolderGit2 size={13} className="shrink-0" /><span className="truncate">{base(p)}</span>
            </button>
          ))}
          {!st.recentProjects.length && <p className="px-1 text-xs text-muted">No recent projects.</p>}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {st.projectPath ? <FileExplorer /> : <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted"><FolderOpen size={22} strokeWidth={1.5} />Open a project to browse and edit its files.</div>}
      </div>
    </div>
  )
}
