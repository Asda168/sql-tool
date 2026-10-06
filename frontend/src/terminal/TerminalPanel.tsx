import { useEffect, useRef, useState } from 'react'
import { Columns2, Eraser, Maximize2, Minimize2, Plus, Skull, X } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { bridge, type ShellId } from '../bridge'
import { useApp } from '../store/app'
import { termIds, useTerms, type TermItem } from './termStore'

function TermView({ item, visible }: { item: TermItem; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const idRef = useRef<string | null>(null)
  const { fontFamily, terminalFontSize, ligatures } = useApp((s) => s.settings)
  const theme = useApp((s) => s.resolvedTheme)
  const remove = useTerms((s) => s.remove)

  useEffect(() => {
    const t = new Terminal({
      fontFamily: `"${fontFamily}", monospace`, fontSize: terminalFontSize, cursorBlink: true, allowProposedApi: true, scrollback: 5000,
      theme: theme === 'dark' ? { background: '#0d0d0d', foreground: '#e5e7eb', cursor: '#22bee8' } : { background: '#ffffff', foreground: '#161e2e', cursor: '#087ea4', selectionBackground: '#cfe8f2' },
    })
    const f = new FitAddon()
    t.loadAddon(f)
    t.open(host.current!)
    term.current = t; fit.current = f
    let disposed = false
    const doFit = () => { try { f.fit(); if (idRef.current) void bridge().term.resize(idRef.current, t.cols, t.rows) } catch { /* hidden */ } }
    doFit()
    bridge().term.spawn((item.shell === 'default' ? 'bash' : item.shell) as ShellId, item.cwd, (d) => t.write(d), () => { if (!disposed) t.write('\r\n\x1b[90m[process exited]\x1b[0m\r\n') })
      .then((id) => {
        if (disposed) { void bridge().term.kill(id); return }
        idRef.current = id
        termIds.set(item.key, id)
        t.onData((d) => void bridge().term.write(id, d))
        doFit()
      })
      .catch((e) => t.write(`\x1b[31mFailed to start shell: ${(e as Error).message ?? e}\x1b[0m\r\n`))
    const ro = new ResizeObserver(doFit)
    ro.observe(host.current!)
    return () => { disposed = true; termIds.delete(item.key); ro.disconnect(); if (idRef.current) void bridge().term.kill(idRef.current); t.dispose() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (term.current) { term.current.options.fontSize = terminalFontSize; term.current.options.fontFamily = `"${fontFamily}", monospace`; fit.current?.fit() } }, [fontFamily, terminalFontSize, ligatures])
  useEffect(() => { if (visible) { setTimeout(() => fit.current?.fit(), 0); term.current?.focus() } }, [visible])
  // exposes kill/clear to the toolbar through the DOM node
  useEffect(() => {
    const el = host.current
    if (!el) return
    ;(el as unknown as { __clear: () => void }).__clear = () => term.current?.clear()
    ;(el as unknown as { __kill: () => void }).__kill = () => remove(item.key)
  }, [item.key, remove])
  return <div ref={host} data-term={item.key} className="h-full bg-bg p-1" style={{ display: visible ? 'block' : 'none', flex: 1, minWidth: 0 }} />
}

export default function TerminalPanel() {
  const { items, activeKey, split, add, remove, setActive, toggleSplit } = useTerms()
  const { terminalMax, toggle, settings, setSettings } = useApp()
  const [shells, setShells] = useState<{ id: ShellId; label: string }[]>([])
  const [menu, setMenu] = useState(false)
  useEffect(() => { void bridge().term.shells().then(setShells) }, [])
  useEffect(() => { if (!items.length) add() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const idx = items.findIndex((i) => i.key === activeKey)
  const second = split ? items[(idx + 1) % items.length] : undefined
  const call = (k: string, fn: '__clear' | '__kill') => (document.querySelector(`[data-term="${k}"]`) as unknown as Record<string, () => void> | null)?.[fn]?.()
  const visibleKeys = new Set([activeKey, second && second.key !== activeKey ? second.key : undefined])
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-2 text-xs">
        <div role="tablist" className="flex min-w-0 flex-1 items-center overflow-x-auto">
          {items.map((i) => (
            <div key={i.key} role="tab" aria-selected={i.key === activeKey} onClick={() => setActive(i.key)} className={`flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-1.5 ${i.key === activeKey ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}>
              {i.title}
              <button aria-label={`Close ${i.title}`} className="hover:text-danger" onClick={(e) => { e.stopPropagation(); call(i.key, '__kill') }}><X size={11} /></button>
            </div>
          ))}
        </div>
        <select aria-label="Shell" className="rounded border border-line bg-bg px-1 py-0.5" value={settings.terminalShell} onChange={(e) => setSettings({ terminalShell: e.target.value })}>
          <option value="default">Default shell</option>
          {shells.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <div className="relative">
          <button className="btn !px-1.5" title="New terminal" aria-label="New terminal" aria-haspopup="menu" onClick={() => setMenu((m) => !m)}><Plus size={13} /></button>
          {menu && <div role="menu" className="absolute bottom-full right-0 z-30 mb-1 min-w-[150px] rounded-lg border border-line bg-raised py-1 text-xs shadow-xl" onMouseLeave={() => setMenu(false)}>{shells.map((sh) => <button key={sh.id} role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-accent/15" onClick={() => { setMenu(false); add(undefined, sh.id) }}>{sh.label}</button>)}</div>}
        </div>
        <button className="btn !px-1.5" title="Kill terminal" aria-label="Kill terminal" onClick={() => activeKey && call(activeKey, '__kill')}><Skull size={13} /></button>
        <button className="btn !px-1.5" title="Clear" aria-label="Clear terminal" onClick={() => activeKey && call(activeKey, '__clear')}><Eraser size={13} /></button>
        <button className={`btn !px-1.5 ${split ? 'border-accent' : ''}`} title="Split" aria-label="Split terminal" onClick={() => { if (!split && items.length < 2) add(); toggleSplit() }}><Columns2 size={13} /></button>
        <button className="btn !px-1.5" title={terminalMax ? 'Restore' : 'Maximize'} aria-label="Maximize terminal" onClick={() => toggle('terminalMax')}>{terminalMax ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
        <button className="btn !px-1.5" title="Hide terminal" aria-label="Hide terminal" onClick={() => toggle('showTerminal')}><X size={13} /></button>
      </div>
      <div className="flex min-h-0 flex-1 gap-px bg-line">
        {items.map((i) => <TermView key={i.key} item={i} visible={visibleKeys.has(i.key)} />)}
      </div>
    </div>
  )
}
