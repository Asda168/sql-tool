import { useEffect } from 'react'
import { Files, GitBranch, History, Info, Moon, PanelLeft, PanelRight, Plus, Search as SearchIcon, Settings, Sun, SquareTerminal, Database } from 'lucide-react'
import { bridge } from '../bridge'
import { ENVIRONMENTS } from '../lib/engines'
import { ENGINES } from '../lib/engines'
import { useApp, type LeftPanel } from '../store/app'
import DbExplorer from '../database/DbExplorer'
import GitPanel from '../git/GitPanel'
import TerminalPanel from '../terminal/TerminalPanel'
import { useTerms } from '../terminal/termStore'
import { AboutDialog, CloneDialog, ConfirmDialog, ConnectionDialog, PromptDialog } from './Dialogs'
import EditorArea from './EditorArea'
import FileExplorer from './FileExplorer'
import { LogoFull } from './Logo'
import Palette, { SaveQueryDialog } from './Palette'
import { HistoryPanel, SearchPanel } from './SidePanels'
import { EnvBadge, Splitter, useSplitter } from './ui'

function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-8 right-4 z-[70] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto max-w-sm rounded-lg border bg-raised px-3 py-2 text-xs shadow-xl ${t.kind === 'error' ? 'border-danger text-danger' : t.kind === 'success' ? 'border-ok' : 'border-line'}`}>{t.kind === 'error' ? '✕ ' : t.kind === 'success' ? '✓ ' : ''}{t.text}</div>)}
    </div>
  )
}

function DialogHost() {
  const d = useApp((s) => s.dialog)
  if (!d) return null
  switch (d.type) {
    case 'confirm': return <ConfirmDialog d={d} />
    case 'prompt': return <PromptDialog d={d} />
    case 'connection': return <ConnectionDialog editId={d.editId} engine={d.engine} />
    case 'clone': return <CloneDialog />
    case 'about': return <AboutDialog />
    case 'palette': return <Palette mode={d.mode} />
    case 'save-query': return <SaveQueryDialog sql={d.sql} />
  }
}

const PANELS: { id: LeftPanel; icon: typeof Files; label: string }[] = [
  { id: 'files', icon: Files, label: 'Explorer' }, { id: 'search', icon: SearchIcon, label: 'Search' }, { id: 'git', icon: GitBranch, label: 'Source Control' }, { id: 'history', icon: History, label: 'History' },
]

export default function IdeShell() {
  const st = useApp()
  const left = useSplitter(260, 180, 520, 'x')
  const right = useSplitter(280, 200, 560, 'x', true)
  const term = useSplitter(280, 120, 700, 'y', true)
  const conn = st.connections.find((c) => c.id === st.activeConnId)
  const sess = st.activeConnId ? st.sessions[st.activeConnId] : undefined

  // theme + code font variables
  useEffect(() => { document.documentElement.dataset.theme = st.resolvedTheme }, [st.resolvedTheme])
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
      const m = e.ctrlKey || e.metaKey
      if (!m) return
      const s = useApp.getState()
      const k = e.key.toLowerCase()
      const fs = s.settings.fontSize
      if (k === 'p' && e.shiftKey) { e.preventDefault(); s.setDialog({ type: 'palette', mode: 'commands' }) }
      else if (k === 'p') { e.preventDefault(); s.setDialog({ type: 'palette', mode: 'files' }) }
      else if (k === 'b') { e.preventDefault(); s.toggle('showLeft') }
      else if (k === 'j') { e.preventDefault(); s.toggle('showTerminal') }
      else if (k === 's') { e.preventDefault(); if (s.activeTabId) void s.saveTab(s.activeTabId) }
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

  // warn before leaving with unsaved work
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (useApp.getState().tabs.some((t) => (t.kind === 'sql' || t.kind === 'file') && t.dirty)) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  // first run: show welcome
  useEffect(() => { if (!st.tabs.length) st.openTab({ id: 'welcome', kind: 'welcome', title: 'Welcome' }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const Panel = { files: FileExplorer, git: GitPanel, history: HistoryPanel, search: SearchPanel }[st.leftPanel]
  const maxed = st.showTerminal && st.terminalMax

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      {conn?.environment === 'production' && sess && <div role="alert" className="shrink-0 bg-danger px-3 py-1 text-center text-[11px] font-bold tracking-[0.25em] text-white">⚠ PRODUCTION DATABASE — {conn.name}</div>}
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-panel px-2 text-xs">
        <LogoFull className="mr-3 text-sm" />
        <button className="btn border-transparent bg-transparent" onClick={() => st.setLeftPanel('files')}><Files size={13} />Project</button>
        <button className="btn border-transparent bg-transparent" onClick={() => st.setDialog({ type: 'connection' })}><Database size={13} />Database</button>
        <button className="btn border-transparent bg-transparent" onClick={() => st.setLeftPanel('git')}><GitBranch size={13} />Git</button>
        <button className="btn border-transparent bg-transparent" onClick={() => useTerms.getState().add()}><SquareTerminal size={13} />Terminal</button>
        <button className="btn border-transparent bg-transparent" onClick={() => st.openTab({ id: 'settings', kind: 'settings', title: 'Settings' })}><Settings size={13} />Settings</button>
        <div className="flex-1" />
        <button className="btn" onClick={() => st.newSqlTab('')}><Plus size={13} />New Query</button>
        <button className="btn !px-1.5" aria-label="Toggle sidebar" onClick={() => st.toggle('showLeft')}><PanelLeft size={14} /></button>
        <button className="btn !px-1.5" aria-label="Toggle database panel" onClick={() => st.toggle('showRight')}><PanelRight size={14} /></button>
        <button className="btn !px-1.5" aria-label="Toggle theme" onClick={() => st.setSettings({ theme: st.resolvedTheme === 'dark' ? 'light' : 'dark' })}>{st.resolvedTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</button>
        <button className="btn !px-1.5" aria-label="About" onClick={() => st.setDialog({ type: 'about' })}><Info size={14} /></button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2" aria-label="Sidebar views">
          {PANELS.map((p) => <button key={p.id} title={p.label} aria-label={p.label} aria-pressed={st.showLeft && st.leftPanel === p.id} className={`rounded-md p-2 ${st.showLeft && st.leftPanel === p.id ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'}`} onClick={() => st.setLeftPanel(p.id)}><p.icon size={17} /></button>)}
        </nav>
        {st.showLeft && !maxed && <><aside className="min-h-0 shrink-0 overflow-hidden bg-panel" style={{ width: left.size }}><Panel /></aside><Splitter dir="x" onMouseDown={left.start} /></>}
        <main className="flex min-w-0 flex-1 flex-col">
          {!maxed && <div className="min-h-0 flex-1"><EditorArea /></div>}
          {st.showTerminal && <><Splitter dir="y" onMouseDown={term.start} /><div className="shrink-0" style={maxed ? { flex: 1 } : { height: term.size }}><TerminalPanel /></div></>}
        </main>
        {st.showRight && !maxed && <><Splitter dir="x" onMouseDown={right.start} /><aside className="min-h-0 shrink-0 overflow-hidden bg-panel" style={{ width: right.size }}><DbExplorer /></aside></>}
      </div>

      <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[11px] text-muted" role="status">
        <button className="flex items-center gap-1 hover:text-fg" onClick={() => st.setLeftPanel('git')}><GitBranch size={11} />{st.projectPath ? <GitBranchName /> : 'no project'}</button>
        <span className="flex items-center gap-1.5">
          <Database size={11} />{conn && sess ? <>{ENGINES[conn.engine].label}: {conn.name} <EnvBadge env={conn.environment} /></> : 'No database'}
          {conn && sess && <span className="sr-only">{ENVIRONMENTS[conn.environment].label}</span>}
        </span>
        {bridge().kind === 'demo' && <span className="text-warn">Browser demo mode</span>}
        <div className="flex-1" />
        <span>Ln {st.cursor.line}, Col {st.cursor.col}</span><span>UTF-8</span><span>{st.settings.fontFamily} {st.settings.fontSize}px</span><span>Tab {st.settings.tabSize}</span>
      </footer>
      <Toasts />
      <DialogHost />
    </div>
  )
}

import { useState } from 'react'
function GitBranchName() {
  const cwd = useApp((s) => s.projectPath)
  const v = useApp((s) => s.gitVersion + s.fsVersion)
  const [b, setB] = useState('')
  useEffect(() => { if (cwd) bridge().git.status(cwd).then((s) => setB(s.isRepo ? s.branch : 'not a repo'), () => setB('')) }, [cwd, v])
  return <span className="code">{b || '…'}</span>
}
