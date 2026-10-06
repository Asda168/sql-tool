import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, KeyRound, Link2, Table2, Zap } from 'lucide-react'
import { ENGINES } from '../lib/engines'
import type { NamedObject, SchemaColumn } from '../lib/introspect'
import { useScrollWindow } from '../lib/useScrollWindow'
import { useApp } from '../store/app'
import { useContextMenu } from '../components/ui'
import { uid } from '../store/app'
import { ctx } from './actions'
import { openTableData, tableMenuItems } from './tableMenu'

const ROW_H = 24

type ObjKind = 'procedures' | 'functions' | 'triggers' | 'events'
type Flat =
  | { key: string; depth: number; type: 'cat'; label: string; count?: number; open: boolean; cat: 'tables' | 'views' | ObjKind }
  | { key: string; depth: number; type: 'table'; name: string; kind: 'table' | 'view'; cols: number; open: boolean }
  | { key: string; depth: number; type: 'column'; col: SchemaColumn; fk?: string }
  | { key: string; depth: number; type: 'object'; obj: NamedObject }
  | { key: string; depth: number; type: 'note'; text: string }

const Line = memo(function Line({ r, i, selected }: { r: Flat; i: number; selected: boolean }) {
  const pad = 8 + r.depth * 14
  const base = `absolute left-0 right-0 flex items-center gap-1.5 whitespace-nowrap pr-2 text-xs ${selected ? 'bg-accent/15' : 'hover:bg-raised'}`
  const style = { top: i * ROW_H, height: ROW_H, paddingLeft: pad }
  if (r.type === 'note') return <div data-i={i} className={`${base} text-muted`} style={style}>{r.text}</div>
  const chevron = (open: boolean) => <span className="w-3 shrink-0 text-muted">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
  if (r.type === 'cat') {
    return (
      <div data-i={i} role="treeitem" aria-expanded={r.open} aria-level={r.depth + 1} className={`${base} cursor-pointer font-medium`} style={style}>
        {chevron(r.open)}{r.cat === 'tables' ? <Table2 size={13} className="text-muted" /> : r.cat === 'views' ? <Eye size={13} className="text-muted" /> : <Zap size={13} className="text-muted" />}
        <span className="truncate">{r.label}</span>{r.count !== undefined && <span className="ml-auto text-[10px] text-muted">{r.count}</span>}
      </div>
    )
  }
  if (r.type === 'table') {
    return (
      <div data-i={i} role="treeitem" aria-expanded={r.open} aria-level={r.depth + 1} title={`${r.name} — double-click to open`} className={`${base} cursor-pointer`} style={style}>
        {chevron(r.open)}{r.kind === 'view' ? <Eye size={13} className="shrink-0 text-muted" /> : <Table2 size={13} className="shrink-0 text-accent" />}
        <span className="truncate">{r.name}</span><span className="ml-auto shrink-0 text-[10px] text-muted">{r.cols}</span>
      </div>
    )
  }
  if (r.type === 'column') {
    const c = r.col
    return (
      <div data-i={i} role="treeitem" aria-level={r.depth + 1} title={[c.type, c.key, r.fk && `→ ${r.fk}`].filter(Boolean).join(' · ')} className={base} style={style}>
        <span className="w-3 shrink-0" />{c.key === 'PRI' ? <KeyRound size={11} className="shrink-0 text-warn" aria-label="Primary key" /> : r.fk ? <Link2 size={11} className="shrink-0 text-accent" aria-label="Foreign key" /> : <span className="w-[11px] shrink-0" />}
        <span className="code truncate !text-[11px]">{c.name}</span><span className="code ml-auto shrink-0 !text-[10px] text-muted">{c.type}</span>
      </div>
    )
  }
  return (
    <div data-i={i} role="treeitem" aria-level={r.depth + 1} className={base} style={style}>
      <span className="w-3 shrink-0" /><Zap size={11} className="shrink-0 text-muted" /><span className="code truncate !text-[11px]">{r.obj.name}</span><span className="ml-auto shrink-0 text-[10px] text-muted">{r.obj.detail}</span>
    </div>
  )
})

/**
 * Virtualized tree of ONE database: only the rows in view are in the DOM, so 700+ tables scroll smoothly.
 * Rows are positioned absolutely and handled by delegated events (no per-row subscriptions).
 */
export default function SchemaTree({ connId, ns }: { connId: string; ns: string }) {
  const info = useApp((s) => s.schemaCache[connId]?.[ns])
  const engine = useApp((s) => s.sessions[connId]?.engine ?? 'mysql')
  const [open, setOpen] = useState<Set<string>>(() => new Set(['cat:tables']))
  const [objects, setObjects] = useState<Record<string, NamedObject[] | 'loading' | { error: string }>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const { menu, open: ctxOpen } = useContextMenu()
  const caps = ENGINES[engine]

  useEffect(() => { if (!info) void useApp.getState().loadNs(connId, ns) }, [connId, ns, info])
  useEffect(() => { setObjects({}); setSelected(null); box.current && (box.current.scrollTop = 0) }, [connId, ns])
  const win = useScrollWindow(box, ROW_H)

  const rows = useMemo<Flat[]>(() => {
    if (!info) return []
    const out: Flat[] = []
    const fkOf = new Map(info.fks.map((f) => [`${f.table}.${f.column}`, `${f.refTable}.${f.refColumn}`]))
    const names = Object.keys(info.tables)
    const addTables = (kind: 'table' | 'view', cat: 'tables' | 'views', label: string) => {
      const list = names.filter((n) => info.tables[n].kind === kind)
      const isOpen = open.has(`cat:${cat}`)
      out.push({ key: `cat:${cat}`, depth: 0, type: 'cat', label, count: list.length, open: isOpen, cat })
      if (!isOpen) return
      for (const n of list) {
        const t = info.tables[n]
        const tOpen = open.has(`tbl:${n}`)
        out.push({ key: `tbl:${n}`, depth: 1, type: 'table', name: n, kind, cols: t.columns.length, open: tOpen })
        if (tOpen) for (const c of t.columns) out.push({ key: `col:${n}.${c.name}`, depth: 2, type: 'column', col: c, fk: fkOf.get(`${n}.${c.name}`) })
      }
      if (!list.length) out.push({ key: `none:${cat}`, depth: 1, type: 'note', text: 'None' })
    }
    addTables('table', 'tables', 'Tables')
    addTables('view', 'views', 'Views')
    const objCats: [ObjKind, string, boolean][] = [['procedures', 'Procedures', caps.supportsRoutines], ['functions', 'Functions', caps.supportsRoutines], ['triggers', 'Triggers', caps.supportsTriggers], ['events', 'Events', caps.supportsEvents]]
    for (const [cat, label, on] of objCats) {
      if (!on) continue
      const isOpen = open.has(`cat:${cat}`)
      const data = objects[cat]
      out.push({ key: `cat:${cat}`, depth: 0, type: 'cat', label, count: Array.isArray(data) ? data.length : undefined, open: isOpen, cat })
      if (!isOpen) continue
      if (data === 'loading' || data === undefined) out.push({ key: `load:${cat}`, depth: 1, type: 'note', text: 'Loading…' })
      else if (!Array.isArray(data)) out.push({ key: `err:${cat}`, depth: 1, type: 'note', text: data.error })
      else if (!data.length) out.push({ key: `none:${cat}`, depth: 1, type: 'note', text: 'None' })
      else for (const o of data) out.push({ key: `obj:${cat}:${o.name}`, depth: 1, type: 'object', obj: o })
    }
    return out
  }, [info, open, objects, caps.supportsRoutines, caps.supportsTriggers, caps.supportsEvents])

  const toggle = useCallback((key: string) => {
    setOpen((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
    const cat = /^cat:(procedures|functions|triggers|events)$/.exec(key)?.[1] as ObjKind | undefined
    if (cat) {
      setObjects((o) => (o[cat] ? o : { ...o, [cat]: 'loading' }))
      ctx(connId).intro.objects(ns, cat).then((list) => setObjects((o) => ({ ...o, [cat]: list })), (e) => setObjects((o) => ({ ...o, [cat]: { error: (e as Error).message ?? String(e) } })))
    }
  }, [connId, ns])

  const rowAt = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[data-i]')
    return el ? rows[Number(el.getAttribute('data-i'))] : undefined
  }
  const changed = () => { void useApp.getState().loadNs(connId, ns, true) }

  const { first, last } = win.range(rows.length)

  const onKey = (e: React.KeyboardEvent) => {
    const idx = rows.findIndex((r) => r.key === selected)
    const go = (n: number) => {
      const i = Math.max(0, Math.min(rows.length - 1, n)); setSelected(rows[i]?.key ?? null)
      const el = box.current; if (el) { if (i * ROW_H < el.scrollTop) el.scrollTop = i * ROW_H; else if ((i + 1) * ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = (i + 1) * ROW_H - el.clientHeight }
    }
    const r = rows[idx]
    if (e.key === 'ArrowDown') { e.preventDefault(); go(idx + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(idx <= 0 ? 0 : idx - 1) }
    else if (e.key === 'ArrowRight' && r && (r.type === 'cat' || r.type === 'table') && !r.open) { e.preventDefault(); toggle(r.key) }
    else if (e.key === 'ArrowLeft' && r && (r.type === 'cat' || r.type === 'table') && r.open) { e.preventDefault(); toggle(r.key) }
    else if (e.key === 'Enter' && r) { e.preventDefault(); r.type === 'table' ? openTableData(connId, ns, r.name) : (r.type === 'cat') && toggle(r.key) }
  }

  if (!info) return <div className="p-4 text-xs text-muted" role="status">Loading {ns}…</div>
  return (
    <div
      ref={box} role="tree" tabIndex={0} aria-label={`${ns} objects`} className="scroll-stable relative h-full overflow-auto outline-none [contain:strict]"
      onScroll={win.onScroll}
      onKeyDown={onKey}
      onClick={(e) => { const r = rowAt(e); if (!r) return; setSelected(r.key); box.current?.focus({ preventScroll: true }); if (r.type === 'cat' || r.type === 'table') toggle(r.key) }}
      onDoubleClick={(e) => { const r = rowAt(e); if (r?.type === 'table') openTableData(connId, ns, r.name) }}
      onContextMenu={(e) => {
        const r = rowAt(e)
        if (r?.type === 'table') ctxOpen(e, tableMenuItems(connId, ns, { name: r.name, kind: r.kind }, changed))
        else if (r?.type === 'cat' && r.cat === 'tables') ctxOpen(e, [{ label: 'Create Table', onClick: () => useApp.getState().openTab({ id: `dsg:${connId}:${ns}:new:${uid()}`, kind: 'designer', title: 'New table', connId, ns }) }, { label: 'Show ERD', onClick: () => useApp.getState().openTab({ id: `erd:${connId}:${ns}`, kind: 'erd', title: `ERD ${ns}`, connId, ns }) }, { label: 'Refresh', onClick: changed }])
      }}
    >
      <div style={{ height: rows.length * ROW_H }}>
        {rows.slice(first, last).map((r, k) => <Line key={r.key} r={r} i={first + k} selected={selected === r.key} />)}
      </div>
      {menu}
    </div>
  )
}
