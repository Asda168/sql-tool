import { useEffect, useRef, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { bridge, isTauri } from '../bridge'
import { DEFAULT_LAYOUT, useApp } from '../store/app'
import { toggleTerminal, useTerms } from '../terminal/termStore'
import { Logo } from './Logo'

interface Item { label: string; keys?: string; run: () => void; disabled?: boolean; sep?: boolean }

const ed = async () => (await import('../editor/monaco')).activeEditor

async function editCmd(cmd: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'find' | 'replace') {
  const e = await ed()
  if (!e) return useApp.getState().toast('info', 'Click into an editor first.')
  e.focus()
  switch (cmd) {
    case 'undo': e.trigger('menu', 'undo', null); break
    case 'redo': e.trigger('menu', 'redo', null); break
    case 'cut': document.execCommand('cut'); break
    case 'copy': document.execCommand('copy'); break
    case 'paste': {
      const t = await navigator.clipboard?.readText().catch(() => '')
      const sel = e.getSelection()
      if (t && sel) e.executeEdits('menu', [{ range: sel, text: t, forceMoveMarkers: true }])
      break
    }
    case 'find': e.trigger('menu', 'actions.find', null); break
    case 'replace': e.trigger('menu', 'editor.action.startFindReplace', null); break
  }
}

export function useMenus(): Record<string, Item[]> {
  const st = useApp.getState
  const activeTab = () => st().tabs.find((t) => t.id === st().activeTabId)
  return {
    File: [
      { label: 'New Connection', keys: 'Ctrl+Alt+N', run: () => st().setDialog({ type: 'connection' }) },
      { label: 'New SQL Query', keys: 'Ctrl+T', run: () => void st().newSqlTab('') },
      { label: 'Open Project…', run: async () => { const p = await bridge().fs.pickFolder(); if (p) await st().openProject(p) } },
      { label: 'Open SQL File…', run: async () => { const p = await bridge().fs.pickFile(); if (p) await st().openFile(p) } },
      { sep: true, label: '', run: () => {} },
      { label: 'Save', keys: 'Ctrl+S', run: () => { const t = st().activeTabId; if (t) void st().saveTab(t) } },
      { label: 'Save As…', run: async () => { const t = activeTab(); if (t && (t.kind === 'sql' || t.kind === 'file')) { if (await bridge().fs.saveDialog(t.title, t.content)) st().toast('success', 'Saved a copy') } } },
      { label: 'Close Tab', run: () => { const t = st().activeTabId; if (t) st().closeTab(t) } },
    ],
    Edit: [
      { label: 'Undo', keys: 'Ctrl+Z', run: () => void editCmd('undo') }, { label: 'Redo', keys: 'Ctrl+Y', run: () => void editCmd('redo') },
      { sep: true, label: '', run: () => {} },
      { label: 'Cut', keys: 'Ctrl+X', run: () => void editCmd('cut') }, { label: 'Copy', keys: 'Ctrl+C', run: () => void editCmd('copy') }, { label: 'Paste', keys: 'Ctrl+V', run: () => void editCmd('paste') },
      { sep: true, label: '', run: () => {} },
      { label: 'Find', keys: 'Ctrl+F', run: () => void editCmd('find') }, { label: 'Replace', keys: 'Ctrl+H', run: () => void editCmd('replace') },
    ],
    View: [
      { label: 'Explorer', keys: 'Ctrl+B', run: () => st().toggle('showLeft') },
      { label: 'Editor', run: () => { useApp.setState({ terminalMax: false }); const t = st().activeTabId ?? st().tabs[0]?.id; if (t) st().setActive(t) } },
      { label: 'Terminal', keys: 'Ctrl+`', run: () => toggleTerminal() },
      { label: 'Query Results', run: () => st().toggle('showResults') },
      { sep: true, label: '', run: () => {} },
      { label: st().layout.sidebar === 'left' ? 'Move Sidebar to Right' : 'Move Sidebar to Left', run: () => st().setLayout({ sidebar: st().layout.sidebar === 'left' ? 'right' : 'left' }) },
      { label: st().layout.terminal === 'bottom' ? 'Move Terminal to Right' : 'Move Terminal to Bottom', run: () => st().setLayout({ terminal: st().layout.terminal === 'bottom' ? 'right' : 'bottom' }) },
      { label: st().layout.results === 'bottom' ? 'Show Results Beside Editor' : 'Show Results Below Editor', run: () => st().setLayout({ results: st().layout.results === 'bottom' ? 'right' : 'bottom' }) },
      { label: st().focusMode ? 'Exit Focus Mode' : 'Focus Mode (editor only)', run: () => st().toggleFocusMode() },
      { label: 'Reset Layout', run: () => { st().setLayout(DEFAULT_LAYOUT); try { ['left', 'terminal', 'terminal-w', 'results-h', 'results-w'].forEach((k) => localStorage.removeItem('forge.size.' + k)) } catch { /* storage unavailable */ } st().toast('info', 'Layout reset. Panel sizes return to defaults on reload.') } },
      { sep: true, label: '', run: () => {} },
      { label: 'Full Screen', keys: 'F11', run: () => { document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen().catch(() => {}) } },
    ],
    Tools: [
      { label: 'Database Manager', run: () => { st().setLeftPanel('database'); useApp.setState({ connList: true, showLeft: true }) } },
      { label: 'Go to Table…', keys: 'Ctrl+E', run: () => st().setDialog({ type: 'palette', mode: 'tables' }) },
      { label: 'Git', run: () => st().setLeftPanel('git') },
      { label: 'Query History', run: () => st().setLeftPanel('history') },
      { label: 'Command Palette', keys: 'Ctrl+Shift+P', run: () => st().setDialog({ type: 'palette', mode: 'commands' }) },
      { label: 'Settings', run: () => st().openTab({ id: 'settings', kind: 'settings', title: 'Settings' }) },
    ],
    Help: [
      { label: 'Documentation', run: () => void window.open('/docs', '_blank') },
      { label: 'Keyboard Shortcuts', run: () => { useApp.setState({ settingsCat: 'Keyboard' }); st().openTab({ id: 'settings', kind: 'settings', title: 'Settings' }) } },
      { label: 'About MySQL Forge Studio', run: () => st().setDialog({ type: 'about' }) },
    ],
  }
}

function WindowControls() {
  const [max, setMax] = useState(false)
  const w = async () => (await import('@tauri-apps/api/window')).getCurrentWindow()
  useEffect(() => { void w().then(async (x) => setMax(await x.isMaximized())) }, [])
  const btn = 'flex h-full w-11 items-center justify-center text-muted hover:bg-raised hover:text-fg'
  return (
    <div className="flex h-full">
      <button className={btn} aria-label="Minimize" onClick={async () => (await w()).minimize()}><Minus size={14} /></button>
      <button className={btn} aria-label={max ? 'Restore' : 'Maximize'} onClick={async () => { const x = await w(); await x.toggleMaximize(); setMax(await x.isMaximized()) }}><Square size={11} /></button>
      <button className={`${btn} hover:!bg-danger hover:!text-white`} aria-label="Close" onClick={async () => (await w()).close()}><X size={15} /></button>
    </div>
  )
}

export default function TitleBar() {
  const menus = useMenus()
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const conn = useApp((s) => s.connections.find((c) => c.id === s.activeConnId && s.sessions[c.id]))
  const project = useApp((s) => s.projectPath)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null) }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('mousedown', down); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [open])
  const title = [conn?.name, project?.split(/[\\/]/).pop()].filter(Boolean).join('  ·  ')
  return (
    <div ref={ref} className="flex h-9 shrink-0 select-none items-center border-b border-line bg-panel text-xs" data-tauri-drag-region>
      <div className="flex items-center gap-2 px-3" data-tauri-drag-region><Logo className="h-5 w-5" /></div>
      <nav className="flex h-full items-center" aria-label="Application menu" role="menubar">
        {Object.entries(menus).map(([name, items]) => (
          <div key={name} className="relative h-full">
            <button role="menuitem" aria-haspopup="menu" aria-expanded={open === name} className={`h-full px-3 hover:bg-raised ${open === name ? 'bg-raised' : ''}`}
              onClick={() => setOpen(open === name ? null : name)} onMouseEnter={() => open && setOpen(name)}>{name}</button>
            {open === name && (
              <div role="menu" className="absolute left-0 top-full z-[80] min-w-[230px] rounded-lg border border-line bg-raised py-1 shadow-2xl">
                {items.map((it, i) => it.sep ? <div key={i} className="my-1 border-t border-line" /> : (
                  <button key={it.label} role="menuitem" disabled={it.disabled} className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-accent/15 disabled:opacity-40" onClick={() => { setOpen(null); it.run() }}>
                    <span>{it.label}</span>{it.keys && <span className="code !text-[10px] text-muted">{it.keys}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1 truncate px-4 text-center text-muted" data-tauri-drag-region>{title || 'MySQL Forge Studio'}</div>
      {isTauri() ? <WindowControls /> : <div className="w-3" />}
    </div>
  )
}

export { useTerms }
