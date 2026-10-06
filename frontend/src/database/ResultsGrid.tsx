import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react'
import { useScrollWindow } from '../lib/useScrollWindow'
import { EXPORT_FORMATS, exportData, type ExportFormat } from '../lib/exporters'
import { bridge } from '../bridge'
import { useApp } from '../store/app'
import { useContextMenu } from '../components/ui'
import type { EngineId } from '../lib/engines'

const ROW_H = 26
const display = (v: unknown) => (v === null || v === undefined ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v))

export interface GridProps {
  columns: string[]
  rows: unknown[][]
  engine: EngineId
  tableName?: string
  readOnlyCols?: Set<string>
  editable?: boolean
  edited?: Set<string> // "row:col"
  rowState?: (row: number) => 'new' | 'deleted' | undefined
  onEdit?: (row: number, col: number, value: string | null) => void
  onSelect?: (row: number | null) => void
  selected?: number | null
  truncated?: boolean
}

export default function ResultsGrid(p: GridProps) {
  const { toast } = useApp()
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null)
  const [filter, setFilter] = useState('')
  const [pageSize, setPageSize] = useState(200)
  const [page, setPage] = useState(0)
  const [widths, setWidths] = useState<Record<number, number>>({})
  const [editing, setEditing] = useState<{ row: number; col: number; text: string } | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const { menu, open } = useContextMenu()

  // indices into p.rows after filter + sort (rows are never copied)
  const view = useMemo(() => {
    let idx = p.rows.map((_, i) => i)
    const f = filter.trim().toLowerCase()
    if (f) idx = idx.filter((i) => p.rows[i].some((v) => display(v).toLowerCase().includes(f)))
    if (sort) {
      const { col, dir } = sort
      idx.sort((a, b) => {
        const x = p.rows[a][col], y = p.rows[b][col]
        if (x === y) return 0
        if (x === null || x === undefined) return 1
        if (y === null || y === undefined) return -1
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir
      })
    }
    return idx
  }, [p.rows, filter, sort])

  const pages = Math.max(1, Math.ceil(view.length / pageSize))
  const cur = Math.min(page, pages - 1)
  const pageIdx = view.slice(cur * pageSize, (cur + 1) * pageSize)
  const win = useScrollWindow(body, ROW_H)
  const { first, last } = win.range(pageIdx.length)
  const visible = pageIdx.slice(first, last)
  const w = (i: number) => widths[i] ?? 160
  const totalW = 48 + p.columns.reduce((s, _c, i) => s + w(i), 0)

  const resize = useCallback((e: React.MouseEvent, i: number) => {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, w0 = widths[i] ?? 160
    const mv = (m: MouseEvent) => setWidths((s) => ({ ...s, [i]: Math.max(50, w0 + m.clientX - x0) }))
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }, [widths])

  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('info', 'Copied'), () => toast('error', 'Clipboard unavailable'))
  const doExport = async (fmt: ExportFormat) => {
    setExportOpen(false)
    const f = EXPORT_FORMATS.find((x) => x.id === fmt)!
    const rows = view.map((i) => p.rows[i])
    const ok = await bridge().fs.saveDialog(`${p.tableName ?? 'results'}.${f.ext}`, exportData(fmt, p.engine, p.tableName ?? 'results', p.columns, rows))
    if (ok) toast('success', `Exported ${rows.length} rows as ${f.label}`)
  }

  const commit = () => {
    if (!editing) return
    p.onEdit?.(editing.row, editing.col, editing.text === 'NULL' ? null : editing.text)
    setEditing(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1 text-xs">
        <Search size={13} className="text-muted" />
        <input aria-label="Filter rows" className="w-48 bg-transparent outline-none placeholder:text-muted" placeholder="Filter…" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0) }} />
        <span className="text-muted">{view.length.toLocaleString()}{filter ? ` of ${p.rows.length.toLocaleString()}` : ''} {view.length === 1 && !filter ? 'row' : 'rows'}</span>
        {p.truncated && <span className="rounded border border-warn/50 px-1 text-warn" title="Only the first rows were loaded. Raise the row limit in Settings → Database.">row limit reached</span>}
        <div className="flex-1" />
        <select aria-label="Page size" className="rounded border border-line bg-bg px-1 py-0.5" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0) }}>
          {[50, 100, 200, 500, 1000].map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
        <button className="btn !px-1.5" aria-label="Previous page" disabled={cur === 0} onClick={() => setPage(cur - 1)}><ChevronLeft size={13} /></button>
        <span className="tabular-nums">{cur + 1} / {pages}</span>
        <button className="btn !px-1.5" aria-label="Next page" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}><ChevronRight size={13} /></button>
        <div className="relative">
          <button className="btn" onClick={() => setExportOpen((o) => !o)}><Download size={13} />Export</button>
          {exportOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-line bg-raised py-1 shadow-xl">
              {EXPORT_FORMATS.map((f) => <button key={f.id} className="block w-full px-3 py-1.5 text-left hover:bg-accent/15" onClick={() => doExport(f.id)}>{f.label}</button>)}
            </div>
          )}
        </div>
      </div>
      <div ref={body} className="code scroll-stable relative min-h-0 flex-1 overflow-auto text-[12.5px]" onScroll={win.onScroll} style={{ fontSize: 12.5 }}>
        <div style={{ width: totalW, minWidth: '100%' }}>
          <div className="sticky top-0 z-10 flex border-b border-line bg-raised" style={{ height: ROW_H }}>
            <div className="shrink-0 border-r border-line" style={{ width: 48 }} />
            {p.columns.map((c, i) => (
              <div key={i} className="relative flex shrink-0 cursor-pointer select-none items-center gap-1 truncate border-r border-line px-2 font-semibold" style={{ width: w(i) }} onClick={() => setSort((s) => (s?.col === i ? (s.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 }))} title={c} aria-sort={sort?.col === i ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                <span className="truncate">{c}</span>
                {sort?.col === i && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                <span className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent" onMouseDown={(e) => resize(e, i)} onClick={(e) => e.stopPropagation()} />
              </div>
            ))}
          </div>
          <div style={{ height: pageIdx.length * ROW_H, position: 'relative' }}>
            {visible.map((ri, k) => {
              const row = p.rows[ri]
              const st = p.rowState?.(ri)
              const sel = p.selected === ri
              return (
                <div key={ri} className={`absolute left-0 flex border-b border-line/50 ${sel ? 'bg-accent/15' : st === 'new' ? 'bg-ok/10' : st === 'deleted' ? 'bg-danger/10 line-through opacity-70' : 'hover:bg-raised/60'}`} style={{ top: (first + k) * ROW_H, height: ROW_H, width: totalW }} onClick={() => p.onSelect?.(ri)}
                  onContextMenu={(e) => open(e, [
                    { label: 'Copy row', onClick: () => copy(row.map(display).join('\t')) },
                    { label: 'Copy row as JSON', onClick: () => copy(JSON.stringify(Object.fromEntries(p.columns.map((c, i) => [c, row[i]])))) },
                  ])}>
                  <div className="shrink-0 border-r border-line px-1 text-right text-muted" style={{ width: 48, lineHeight: `${ROW_H}px` }}>{cur * pageSize + first + k + 1}</div>
                  {row.map((v, ci) => {
                    const isEd = editing?.row === ri && editing.col === ci
                    const dirty = p.edited?.has(`${ri}:${ci}`)
                    return (
                      <div key={ci} className={`shrink-0 truncate border-r border-line/50 px-2 ${dirty ? 'bg-warn/20' : ''} ${v === null || v === undefined ? 'italic text-muted' : typeof v === 'number' ? 'text-right tabular-nums' : ''}`} style={{ width: w(ci), lineHeight: `${ROW_H - 1}px` }} title={display(v)}
                        onDoubleClick={() => p.editable && !p.readOnlyCols?.has(p.columns[ci]) && p.rowState?.(ri) !== 'deleted' && setEditing({ row: ri, col: ci, text: v === null || v === undefined ? '' : String(v) })}
                        onContextMenu={(e) => open(e, [{ label: 'Copy cell', onClick: () => copy(display(v)) }, { label: 'Copy row', onClick: () => copy(row.map(display).join('\t')) }, ...(p.editable ? [{ label: 'Set NULL', onClick: () => p.onEdit?.(ri, ci, null) }] : [])])}>
                        {isEd ? (
                          <input autoFocus className="h-full w-full bg-bg px-1 outline outline-1 outline-accent" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null) }} />
                        ) : display(v)}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
        {pageIdx.length === 0 && <div className="p-6 text-center text-xs text-muted">{p.rows.length ? 'No rows match the filter.' : 'No rows.'}</div>}
      </div>
      {menu}
    </div>
  )
}
