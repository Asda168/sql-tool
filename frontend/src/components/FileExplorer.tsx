import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, File, FilePlus, Folder, FolderOpen, FolderPlus, GitFork, RefreshCw, Terminal } from 'lucide-react'
import { bridge, type DirEntry } from '../bridge'
import { useApp } from '../store/app'
import { openTerminalHere, runInTerminal } from '../terminal/termStore'
import { Empty, useContextMenu } from './ui'

const sepOf = (p: string) => (p.includes('\\') && !p.includes('/') ? '\\' : '/')
export const joinPath = (base: string, name: string) => base.replace(/[\\/]+$/, '') + sepOf(base) + name
const dirname = (p: string) => p.replace(/[\\/][^\\/]*$/, '') || p
const basename = (p: string) => p.split(/[\\/]/).pop() ?? p
let clipboard: { path: string; cut: boolean } | null = null

function Node({ entry, depth }: { entry: DirEntry; depth: number }) {
  const st = useApp()
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<DirEntry[] | null>(null)
  const { menu, open: ctxOpen } = useContextMenu()
  const load = useCallback(async () => { try { setChildren(await bridge().fs.list(entry.path)) } catch (e) { st.toast('error', (e as Error).message ?? String(e)) } }, [entry.path]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) void load() }, [open, st.fsVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeFile = st.tabs.find((t) => t.id === st.activeTabId)
  const isActive = activeFile && 'filePath' in activeFile && activeFile.filePath === entry.path
  return (
    <>
      <div role="treeitem" aria-expanded={entry.isDir ? open : undefined} className={`flex cursor-pointer items-center gap-1 rounded px-1 py-[3px] text-xs hover:bg-raised ${isActive ? 'bg-accent/15' : ''}`} style={{ paddingLeft: 4 + depth * 12 }}
        onClick={() => (entry.isDir ? setOpen(!open) : void st.openFile(entry.path))}
        onContextMenu={(e) => ctxOpen(e, fileMenu(entry, () => { setOpen(true); void load(); st.bumpFs() }))}>
        <span className="w-3 text-muted">{entry.isDir ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
        {entry.isDir ? (open ? <FolderOpen size={13} className="text-accent" /> : <Folder size={13} className="text-accent" />) : <File size={13} className="text-muted" />}
        <span className="truncate">{entry.name}</span>
      </div>
      {open && children?.map((c) => <Node key={c.path} entry={c} depth={depth + 1} />)}
      {open && children && !children.length && <div className="text-[11px] text-muted" style={{ paddingLeft: 30 + depth * 12 }}>empty</div>}
      {menu}
    </>
  )
}

export function fileMenu(entry: { path: string; isDir: boolean; name: string }, refresh: () => void) {
  const st = useApp.getState()
  const fs = bridge().fs
  const guard = async (fn: () => Promise<unknown>) => { try { await fn(); refresh(); st.bumpFs(); st.bumpGit() } catch (e) { st.toast('error', (e as Error).message ?? String(e)) } }
  const dir = entry.isDir ? entry.path : dirname(entry.path)
  const closeTabsUnder = (p: string) => st.tabs.forEach((t) => { if ('filePath' in t && t.filePath && (t.filePath === p || t.filePath.startsWith(p + '/') || t.filePath.startsWith(p + '\\'))) st.closeTab(t.id) })
  return [
    { label: 'New File', onClick: () => guard(async () => { const n = await st.prompt({ title: 'New File', label: 'File name', placeholder: 'users.sql, employee.py, UserController.php' }); if (n) { await fs.createFile(joinPath(dir, n)); await st.openFile(joinPath(dir, n)) } }) },
    { label: 'New Folder', onClick: () => guard(async () => { const n = await st.prompt({ title: 'New Folder', label: 'Folder name' }); if (n) await fs.createDir(joinPath(dir, n)) }) },
    { sep: true, label: '', onClick: () => {} },
    ...(!entry.isDir ? [{ label: 'Open in Editor', onClick: () => void st.openFile(entry.path) }] : []),
    { label: 'Rename…', onClick: () => guard(async () => { const n = await st.prompt({ title: 'Rename', label: 'New name', initial: entry.name, confirmLabel: 'Rename' }); if (n && n !== entry.name) { closeTabsUnder(entry.path); await fs.rename(entry.path, joinPath(dirname(entry.path), n)) } }) },
    { label: 'Duplicate', onClick: () => guard(() => fs.copy(entry.path, joinPath(dirname(entry.path), entry.name.replace(/(\.[^.]+)?$/, ' copy$1')))) },
    { label: 'Copy', onClick: () => { clipboard = { path: entry.path, cut: false }; st.toast('info', `Copied ${entry.name}`) } },
    { label: 'Cut (Move)', onClick: () => { clipboard = { path: entry.path, cut: true }; st.toast('info', `Cut ${entry.name}`) } },
    { label: 'Paste', disabled: !clipboard, onClick: () => guard(async () => {
      if (!clipboard) return
      const target = joinPath(dir, basename(clipboard.path))
      if (clipboard.cut) { closeTabsUnder(clipboard.path); await fs.rename(clipboard.path, target); clipboard = null } else await fs.copy(clipboard.path, target.replace(/(\.[^.]+)?$/, (m) => (target === clipboard!.path ? ' copy' : '') + m))
    }) },
    { label: 'Delete', danger: true, onClick: () => guard(async () => { if (await st.confirm({ title: 'Delete', body: `Permanently delete "${entry.name}"${entry.isDir ? ' and everything inside it' : ''}?`, confirmLabel: 'Delete', danger: true })) { closeTabsUnder(entry.path); await fs.remove(entry.path) } }) },
    { sep: true, label: '', onClick: () => {} },
    { label: 'Open Terminal Here', onClick: () => openTerminalHere(dir) },
    { label: 'Reveal in File Explorer', onClick: () => void fs.reveal(entry.path) },
    { label: 'Copy path', onClick: () => void navigator.clipboard?.writeText(entry.path) },
  ]
}

export default function FileExplorer() {
  const st = useApp()
  const [root, setRoot] = useState<DirEntry[] | null>(null)
  const { menu, open: ctxOpen } = useContextMenu()
  const load = useCallback(async () => { if (st.projectPath) try { setRoot(await bridge().fs.list(st.projectPath)) } catch (e) { st.toast('error', (e as Error).message ?? String(e)) } }, [st.projectPath]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRoot(null); void load() }, [st.projectPath, st.fsVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const pick = async () => { const p = await bridge().fs.pickFolder(); if (p) await st.openProject(p) }

  if (!st.projectPath) {
    return (
      <div className="p-3 text-xs">
        <p className="mb-3 text-muted">No project open.</p>
        <div className="flex flex-col gap-2">
          <button className="btn btn-primary justify-center" onClick={pick}><FolderOpen size={13} />Open Project</button>
          <button className="btn justify-center" onClick={() => st.setDialog({ type: 'clone' })}><GitFork size={13} />Clone Repository</button>
        </div>
        {st.recentProjects.length > 0 && <div className="mt-4"><div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Recent</div>{st.recentProjects.map((p) => <button key={p} className="block w-full truncate rounded px-1 py-1 text-left hover:bg-raised" title={p} onClick={() => st.openProject(p)}>{basename(p)}</button>)}</div>}
      </div>
    )
  }
  const rootEntry = { path: st.projectPath, isDir: true, name: basename(st.projectPath) }
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2" onContextMenu={(e) => ctxOpen(e, fileMenu(rootEntry, () => void load()))}>
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider" title={st.projectPath}>{rootEntry.name}</span>
        <div className="flex gap-1">
          <button className="btn !px-1.5" aria-label="New file" title="New file" onClick={async () => { const n = await st.prompt({ title: 'New File', label: 'File name', placeholder: 'users.sql' }); if (n) { try { await bridge().fs.createFile(joinPath(st.projectPath!, n)); st.bumpFs(); await st.openFile(joinPath(st.projectPath!, n)) } catch (e) { st.toast('error', (e as Error).message) } } }}><FilePlus size={13} /></button>
          <button className="btn !px-1.5" aria-label="New folder" title="New folder" onClick={async () => { const n = await st.prompt({ title: 'New Folder', label: 'Folder name' }); if (n) { try { await bridge().fs.createDir(joinPath(st.projectPath!, n)); st.bumpFs() } catch (e) { st.toast('error', (e as Error).message) } } }}><FolderPlus size={13} /></button>
          <button className="btn !px-1.5" aria-label="Refresh" title="Refresh" onClick={() => st.bumpFs()}><RefreshCw size={13} /></button>
        </div>
      </div>
      {st.projectInfo && (
        <div className="shrink-0 border-b border-line px-3 py-2 text-xs">
          <div className="mb-1 font-semibold text-accent">{st.projectInfo.label}</div>
          <div className="flex flex-wrap gap-1">{st.projectInfo.commands.map((c) => <button key={c} className="btn code !px-1.5 !py-0.5 !text-[10px]" title="Run in terminal" onClick={() => runInTerminal(c)}><Terminal size={10} />{c}</button>)}</div>
        </div>
      )}
      <div role="tree" className="min-h-0 flex-1 overflow-auto p-1" onContextMenu={(e) => ctxOpen(e, fileMenu(rootEntry, () => void load()))}>
        {root?.map((e) => <Node key={e.path} entry={e} depth={0} />)}
        {root && !root.length && <Empty>This folder is empty. Right-click to create a file.</Empty>}
      </div>
      {menu}
    </div>
  )
}
