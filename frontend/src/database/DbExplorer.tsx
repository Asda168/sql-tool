import { useEffect, useRef, useState } from 'react'
import { Eye, Table2 } from 'lucide-react'
import Highlight from '../components/Highlight'
import { useContextMenu } from '../components/ui'
import { useApp } from '../store/app'
import { openTableData, tableMenuItems, type TableLike } from './tableMenu'

export function useLoad<T>(enabled: boolean, fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let live = true
    fn().then((d) => live && (setData(d), setErr('')), (e) => live && setErr((e as Error).message ?? String(e)))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, ...deps])
  return { data, err, reload: () => setTick((t) => t + 1) }
}

/** A table result row (search results; the main tree is the virtualized SchemaTree). Click opens it; right-click has the full menu. */
export function TableNode({ connId, ns, t, onChanged, query = '', active = false, subtitle }: { connId: string; ns: string; t: TableLike; onChanged: () => void; query?: string; active?: boolean; subtitle?: string }) {
  const { menu, open } = useContextMenu()
  const ref = useRef<HTMLDivElement>(null)
  // keep the active row visible by scrolling ONLY its own list (scrollIntoView would scroll every ancestor and shift the whole UI)
  useEffect(() => {
    const el = ref.current, box = el?.closest('[role=listbox]') as HTMLElement | null
    if (!active || !el || !box) return
    const top = el.offsetTop, bottom = top + el.offsetHeight
    if (top < box.scrollTop) box.scrollTop = Math.max(0, top - 4)
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 4
  }, [active])
  return (
    <>
      <div ref={ref} role="option" aria-selected={active} title={t.comment || `${t.name} — click to open`}
        className={`relative flex h-8 cursor-pointer items-center gap-2 rounded-md px-3 text-xs transition-colors ${active ? 'bg-accent/15' : 'hover:bg-raised'}`}
        onClick={() => openTableData(connId, ns, t.name)}
        onContextMenu={(e) => open(e, tableMenuItems(connId, ns, t, onChanged))}>
        {active && <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent" aria-hidden />}
        {t.kind === 'view' ? <Eye size={13} className="shrink-0 text-muted" /> : <Table2 size={13} className="shrink-0 text-accent" />}
        <span className="code min-w-0 flex-1 truncate !text-[12px]"><Highlight text={t.name} query={query} /></span>
        {subtitle && <span className="shrink-0 text-[10px] text-muted">{subtitle}</span>}
        {t.kind === 'view' && <span className="shrink-0 rounded border border-line px-1 text-[9px] uppercase tracking-wider text-muted">view</span>}
      </div>
      {menu}
    </>
  )
}

export { useApp }
