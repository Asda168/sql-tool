import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { ENVIRONMENTS, type Environment } from '../lib/engines'

export function Modal({ title, onClose, children, width = 'max-w-lg', banner, labelledBy = 'modal-title' }: { title: string; onClose: () => void; children: ReactNode; width?: string; banner?: string; labelledBy?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-6 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={`w-full ${width} overflow-hidden rounded-xl border border-line bg-panel shadow-2xl`}>
        {banner && <div className="bg-danger px-4 py-1.5 text-center text-xs font-bold tracking-widest text-white">⚠ {banner}</div>}
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 id={labelledBy} className="text-sm font-semibold">{title}</h2>
          <button className="text-muted hover:text-fg" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
    </label>
  )
}

export function EnvBadge({ env }: { env: Environment }) {
  const e = ENVIRONMENTS[env]
  // glyph + text, so the environment never relies on color alone
  return <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-[1px] text-[10px] font-semibold tracking-wide ${e.cls}`}><span aria-hidden>{e.badge}</span>{e.label}</span>
}

export interface MenuItem { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; sep?: boolean }

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) })
    const close = () => onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', close)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); window.removeEventListener('blur', close) }
  }, [x, y, onClose])
  return (
    <div ref={ref} role="menu" style={{ left: pos.x, top: pos.y }} className="fixed z-[60] min-w-[190px] rounded-lg border border-line bg-raised py-1 text-xs shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
      {items.map((it, i) =>
        it.sep ? <div key={i} className="my-1 border-t border-line" /> : (
          <button key={i} role="menuitem" disabled={it.disabled} className={`block w-full px-3 py-1.5 text-left hover:bg-accent/15 disabled:opacity-40 ${it.danger ? 'text-danger' : ''}`} onClick={() => { onClose(); it.onClick() }}>
            {it.label}
          </button>
        ),
      )}
    </div>
  )
}

/** Hook: `const { menu, open } = useContextMenu()`; render `{menu}`; call `open(e, items)` in onContextMenu. */
export function useContextMenu() {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  return {
    menu: state && <ContextMenu {...state} onClose={() => setState(null)} />,
    open: (e: React.MouseEvent, items: MenuItem[]) => { e.preventDefault(); e.stopPropagation(); setState({ x: e.clientX, y: e.clientY, items }) },
  }
}

export function useSplitter(initial: number, min: number, max: number, dir: 'x' | 'y', invert = false) {
  const [size, setSize] = useState(initial)
  const start = (e: React.MouseEvent) => {
    e.preventDefault()
    const s0 = dir === 'x' ? e.clientX : e.clientY
    const z0 = size
    const move = (m: MouseEvent) => {
      const d = (dir === 'x' ? m.clientX : m.clientY) - s0
      setSize(Math.max(min, Math.min(max, z0 + (invert ? -d : d))))
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.userSelect = '' }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  return { size, start }
}

export function Splitter({ dir, onMouseDown }: { dir: 'x' | 'y'; onMouseDown: (e: React.MouseEvent) => void }) {
  return <div role="separator" aria-orientation={dir === 'x' ? 'vertical' : 'horizontal'} onMouseDown={onMouseDown} className={`shrink-0 bg-line/60 hover:bg-accent ${dir === 'x' ? 'w-[3px] cursor-col-resize' : 'h-[3px] cursor-row-resize'}`} />
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="p-4 text-center text-xs text-muted">{children}</div>
}
