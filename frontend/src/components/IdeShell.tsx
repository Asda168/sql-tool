import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { bridge } from '../bridge'
import { ENGINES } from '../lib/engines'
import { mod } from '../lib/os'
import { shortcutKey } from '../lib/shortcut'
import { uid, useApp } from '../store/app'
import { useCursor } from '../store/cursor'
import DialogHost from './DialogHost'
import ActivityBar from './ActivityBar'
import EditorArea from './EditorArea'
import { joinPath } from './FileExplorer'
import ProjectsPanel from './ProjectsPanel'
import { HistoryPanel, SearchPanel } from './SidePanels'
import { ConnectionSwitcher, DatabaseSwitcher } from './StatusSwitchers'
import TitleBar from './TitleBar'
import { EnvBadge, Splitter, useSplitter } from './ui'
import DatabasePanel from '../database/ExplorerPanel'
import GitPanel from '../git/GitPanel'
import TerminalPanel from '../terminal/TerminalPanel'
import { toggleTerminal } from '../terminal/termStore'
import { refreshStacks } from '../store/stacks'

function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-9 right-4 z-[70] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto max-w-sm rounded-lg border bg-raised px-3 py-2 text-xs shadow-xl ${t.kind === 'error' ? 'border-danger text-danger' : t.kind === 'success' ? 'border-ok' : 'border-line'}`}>{t.kind === 'error' ? '✕ ' : t.kind === 'success' ? '✓ ' : ''}{t.text}</div>)}
    </div>
  )
}

const WS_KEY = 'forge.workspace'
let saveTimer: number | undefined

/** Persist layout, project and open tabs so the next launch picks up where you left off. */
function saveWorkspace() {
  const s = useApp.getState()
  const tabs = s.tabs.filter((t) => t.kind === 'sql' || t.kind === 'file')
  const snap = {
    projectPath: s.projectPath, leftPanel: s.leftPanel, showLeft: s.showLeft, showResults: s.showResults,
    activeIndex: tabs.findIndex((t) => t.id === s.activeTabId),
    tabs: tabs.map((t) => (t.kind === 'sql' ? { k: 'sql', title: t.title, content: t.content.slice(0, 200_000), filePath: t.filePath, connId: t.connId, pinned: t.pinned } : { k: 'file', filePath: (t as { filePath: string }).filePath, pinned: t.pinned })),
  }
  try { localStorage.setItem(WS_KEY, JSON.stringify(snap)) } catch { /* storage unavailable */ }
}

async function restoreWorkspace(): Promise<boolean> {
  let snap: ReturnType<typeof JSON.parse>
  try { snap = JSON.parse(localStorage.getItem(WS_KEY) ?? 'null') } catch { return false }
  if (!snap) return false
  useApp.setState({ leftPanel: snap.leftPanel ?? 'database', showLeft: snap.showLeft ?? true, showResults: snap.showResults ?? true })
  if (snap.projectPath) await useApp.getState().openProject(snap.projectPath).catch(() => {})
  useApp.setState({ leftPanel: snap.leftPanel ?? 'database' })
  for (const t of snap.tabs ?? []) {
    if (t.k === 'sql') useApp.getState().openTab({ id: uid(), kind: 'sql', title: t.title, content: t.content, filePath: t.filePath, dirty: false, connId: t.connId, pinned: t.pinned })
    else if (t.filePath) await useApp.getState().openFile(t.filePath)
  }
  const tabs = useApp.getState().tabs
  if (tabs[snap.activeIndex]) useApp.setState({ activeTabId: tabs[snap.activeIndex].id })
  return tabs.length > 0
}

async function newFileOrQuery(folder: boolean) {
  const s = useApp.getState()
  if (!s.projectPath) { if (!folder) s.newSqlTab(''); else s.toast('info', 'Open a project first.'); return }
  const sel = s.selectedEntry
  const dir = sel ? (sel.isDir ? sel.path : sel.path.replace(/[\\/][^\\/]*$/, '')) : s.projectPath
  const name = await s.prompt({ title: folder ? 'New Folder' : 'New File', label: folder ? 'Folder name' : 'File name', placeholder: folder ? 'src' : 'users.sql' })
  if (!name) return
  try {
    const target = joinPath(dir, name)
    if (folder) await bridge().fs.createDir(target); else { await bridge().fs.createFile(target); await s.openFile(target) }
    s.bumpFs(); s.bumpGit(); s.setLeftPanel('projects')
  } catch (e) { s.toast('error', (e as Error).message ?? String(e)) }
}

export default function IdeShell() {
  // subscribe only to what the shell renders: unrelated store changes (results, toasts, schema loads) must not re-render it
  const st = useApp(useShallow((s) => ({
    activeConnId: s.activeConnId, connections: s.connections, leftPanel: s.leftPanel, projectPath: s.projectPath, resolvedTheme: s.resolvedTheme,
    saveTab: s.saveTab, sessions: s.sessions, setLeftPanel: s.setLeftPanel, settings: s.settings, showLeft: s.showLeft, showTerminal: s.showTerminal, tabs: s.tabs, terminalMax: s.terminalMax, layout: s.layout,
  })))
  const sideRight = st.layout.sidebar === 'right'
  const termRight = st.layout.terminal === 'right'
  const left = useSplitter(360, 240, 600, 'x', sideRight, 'left') // dragging toward the editor grows the sidebar on either side
  const term = useSplitter(280, 120, 700, 'y', true, 'terminal')
  const termW = useSplitter(560, 280, 1200, 'x', true, 'terminal-w')
  const conn = st.connections.find((c) => c.id === st.activeConnId)
  const sess = st.activeConnId ? st.sessions[st.activeConnId] : undefined
  const maxed = st.showTerminal && st.terminalMax
  const [ready, setReady] = useState(false)
  const [termMounted, setTermMounted] = useState(false) // once opened, the terminal stays mounted (hidden) so its shells keep running
  useEffect(() => { if (st.showTerminal) setTermMounted(true) }, [st.showTerminal])

  useEffect(() => { document.documentElement.dataset.theme = st.resolvedTheme }, [st.resolvedTheme])
  useEffect(() => { document.documentElement.classList.add('ide'); return () => document.documentElement.classList.remove('ide') }, [])
  useEffect(() => {
    if (st.settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = () => useApp.setState({ resolvedTheme: mq.matches ? 'dark' : 'light' })
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [st.settings.theme])
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--code-font', `"${st.settings.fontFamily}"`)
    r.setProperty('--code-size', `${st.settings.fontSize}px`)
  }, [st.settings.fontFamily, st.settings.fontSize])

  // global shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const s = useApp.getState()
      if (e.key === 'F11') { e.preventDefault(); document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen().catch(() => {}); return }
      const m = e.ctrlKey || e.metaKey
      if (!m) return
      const k = shortcutKey(e) // layout-independent: works on non-Latin and AZERTY keyboards too
      const fs = s.settings.fontSize
      if (k === 'p' && e.shiftKey) { e.preventDefault(); s.setDialog({ type: 'palette', mode: 'commands' }) }
      else if (k === 'p') { e.preventDefault(); s.setDialog({ type: 'palette', mode: 'files' }) }
      else if (k === 'e') { e.preventDefault(); s.setDialog({ type: 'palette', mode: 'tables' }) }
      else if (k === 'b') { e.preventDefault(); s.toggle('showLeft') }
      else if (k === 'j' || k === '`') { e.preventDefault(); toggleTerminal() }
      else if (k === 's') { e.preventDefault(); if (s.activeTabId) void s.saveTab(s.activeTabId) }
      else if (k === 'n' && e.altKey) { e.preventDefault(); s.setDialog({ type: 'connection' }) }
      else if (k === 'n') { e.preventDefault(); void newFileOrQuery(e.shiftKey) }
      else if (k === 't') { e.preventDefault(); s.newSqlTab('') }
      else if (k === 'd' && e.shiftKey) { e.preventDefault(); s.setLeftPanel('database') }
      else if (k === '=' || k === '+') { e.preventDefault(); s.setSettings({ fontSize: Math.min(48, fs + 1) }) }
      else if (k === '-') { e.preventDefault(); s.setSettings({ fontSize: Math.max(8, fs - 1) }) }
      else if (k === '0') { e.preventDefault(); s.setSettings({ fontSize: 14 }) }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [])

  // auto save (only files that already exist on disk)
  useEffect(() => {
    if (!st.settings.autoSave) return
    const t = setTimeout(() => st.tabs.forEach((x) => { if ((x.kind === 'file' || x.kind === 'sql') && x.dirty && x.filePath) void st.saveTab(x.id) }), 1200)
    return () => clearTimeout(t)
  }, [st.tabs, st.settings.autoSave]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (useApp.getState().tabs.some((t) => (t.kind === 'sql' || t.kind === 'file') && t.dirty)) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  // restore the previous workspace, then fall back to the welcome screen
  useEffect(() => {
    let live = true
    void restoreWorkspace().catch(() => false).then((restored) => {
      if (!live) return
      if (!restored && !useApp.getState().tabs.length) useApp.getState().openTab({ id: 'welcome', kind: 'welcome', title: 'Welcome' })
      setReady(true)
    })
    return () => { live = false }
  }, [])
  useEffect(() => {
    if (!ready) return
    return useApp.subscribe(() => { window.clearTimeout(saveTimer); saveTimer = window.setTimeout(saveWorkspace, 500) })
  }, [ready])

  // Laragon / WAMP / XAMPP: watch for their database servers and connect when one comes up
  useEffect(() => {
    if (!bridge().host) return
    void refreshStacks()
    const t = window.setInterval(() => void refreshStacks(), 5000)
    return () => window.clearInterval(t)
  }, [])

  // Import connections queued for this app (metadata only; their passwords are already in encrypted storage)
  useEffect(() => {
    const hb = bridge().host
    if (!hb) return
    void hb.seeds().then(async (seeds) => {
      const s = useApp.getState()
      const added: string[] = []
      for (const c of seeds) {
        if (!s.connections.some((x) => x.host === c.host && x.port === c.port && x.username === c.username && x.engine === c.engine)) { await s.saveConnection(c); added.push(c.name) }
      }
      if (seeds.length) await hb.ackSeeds(seeds.map((c) => c.id))
      if (added.length) { s.toast('success', `Added connection: ${added.join(', ')}. Click it to connect.`); useApp.setState({ connList: true, leftPanel: 'database', showLeft: true }) }
    }).catch(() => {})
  }, [])

  // Local host mode: on first run create and connect the default local MySQL (127.0.0.1:3306, root, no password)
  useEffect(() => {
    if (bridge().kind !== 'host' || useApp.getState().connections.length) return
    const id = crypto.randomUUID()
    const cfg = { id, name: 'MySQL Local', group: 'LOCAL', environment: 'local' as const, engine: 'mysql' as const, host: '127.0.0.1', port: 3306, username: 'root', database: '', filePath: '', ssl: false, sshEnabled: false, sshHost: '', sshPort: 22, sshUser: '', timeoutSeconds: 10 }
    void useApp.getState().saveConnection(cfg).then(() => useApp.getState().connect(id, '')).catch((e) => useApp.getState().toast('error', `MySQL Local: ${(e as Error).message}`))
  }, [])

  const Panel = { database: DatabasePanel, projects: ProjectsPanel, git: GitPanel, search: SearchPanel, history: HistoryPanel }[st.leftPanel]

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      {conn?.environment === 'production' && sess && <div role="alert" className="shrink-0 bg-danger px-3 py-1 text-center text-[11px] font-bold tracking-[0.25em] text-white">⚠ PRODUCTION DATABASE — {conn.name}</div>}
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        {st.showLeft && !maxed && !sideRight && <><aside aria-label="Side panel" className="min-h-0 shrink-0 overflow-hidden border-r border-line bg-panel" style={{ width: left.size }}><Panel /></aside><Splitter dir="x" onMouseDown={left.start} /></>}
        <main className={`flex min-w-0 flex-1 bg-editor ${termRight ? 'flex-row' : 'flex-col'}`}>
          {!maxed && <div className="min-h-0 min-w-0 flex-1"><EditorArea /></div>}
          {st.showTerminal && !maxed && <Splitter dir={termRight ? 'x' : 'y'} onMouseDown={termRight ? termW.start : term.start} />}
          {(st.showTerminal || termMounted) && (
            <div className="shrink-0" style={{ display: st.showTerminal ? undefined : 'none', ...(maxed ? { flex: 1 } : termRight ? { width: termW.size } : { height: term.size }) }}><TerminalPanel /></div>
          )}
        </main>
        {st.showLeft && !maxed && sideRight && <><Splitter dir="x" onMouseDown={left.start} /><aside aria-label="Side panel" className="min-h-0 shrink-0 overflow-hidden border-l border-line bg-panel" style={{ width: left.size }}><Panel /></aside></>}
      </div>

      <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-panel pl-1 pr-3 text-[11px] text-muted" role="status" aria-label="Status bar">
        <button className="flex items-center gap-1 hover:text-fg" onClick={() => st.setLeftPanel('git')} title="Git branch"><span aria-hidden>⎇</span>{st.projectPath ? <GitBranchName /> : 'no project'}</button>
        <ConnectionSwitcher />
        <DatabaseSwitcher />
        {bridge().kind === 'demo' && <span className="text-warn">Browser demo mode</span>}
        {bridge().kind === 'host' && <span className="text-ok">Local host</span>}
        <div className="flex-1" />
        <span>UTF-8</span><CursorStatus /><span>Spaces: {st.settings.tabSize}</span><span title={`${mod()}+ / ${mod()}-`}>{st.settings.fontFamily} {st.settings.fontSize}px</span>
      </footer>
      <Toasts />
      <DialogHost />
    </div>
  )
}

function GitBranchName() {
  const cwd = useApp((s) => s.projectPath)
  const v = useApp((s) => s.gitVersion + s.fsVersion)
  const [b, setB] = useState('')
  useEffect(() => { if (cwd) bridge().git.status(cwd).then((s) => setB(s.isRepo ? s.branch : 'not a repo'), () => setB('')) }, [cwd, v])
  return <span className="code">{b || '…'}</span>
}

/** Own component so that moving the cursor re-renders only this label, not the whole app. */
function CursorStatus() {
  const line = useCursor((s) => s.line)
  const col = useCursor((s) => s.col)
  return <span>Ln {line}, Col {col}</span>
}
