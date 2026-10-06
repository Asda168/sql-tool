import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileCode, Minus, Plus, Search } from 'lucide-react'
import { bridge } from '../bridge'
import { generateCreateTable } from '../lib/codegen'
import type { TableDetails } from '../lib/introspect'
import { useApp, type Tab } from '../store/app'
import { ctx, designFromDetails } from './actions'

const W = 200, HEAD = 26, ROW = 18, GAP_X = 80, GAP_Y = 50, MAX_TABLES = 60

interface Node { name: string; d: TableDetails; x: number; y: number; h: number }

export default function ErdTab({ tab }: { tab: Extract<Tab, { kind: 'erd' }> }) {
  const st = useApp()
  const sess = st.sessions[tab.connId]
  const [data, setData] = useState<Record<string, TableDetails>>({})
  const [skipped, setSkipped] = useState(0)
  const [err, setErr] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 20, y: 20 })
  const [q, setQ] = useState('')
  const svg = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!sess) return
    let live = true
    ;(async () => {
      try {
        const { intro } = ctx(tab.connId)
        const all = (await intro.tables(tab.ns)).filter((t) => t.kind === 'table')
        setSkipped(Math.max(0, all.length - MAX_TABLES))
        const out: Record<string, TableDetails> = {}
        for (const t of all.slice(0, MAX_TABLES)) { out[t.name] = await intro.details(tab.ns, t.name); if (!live) return }
        setData(out)
      } catch (e) { setErr((e as Error).message ?? String(e)) }
    })()
    return () => { live = false }
  }, [sess?.sessionId, tab.ns]) // eslint-disable-line react-hooks/exhaustive-deps

  const nodes = useMemo(() => {
    const names = Object.keys(data)
    const cols = Math.max(1, Math.ceil(Math.sqrt(names.length * 1.4)))
    const rowsH: number[] = []
    const list: Node[] = names.map((name, i) => ({ name, d: data[name], x: (i % cols) * (W + GAP_X), y: 0, h: HEAD + data[name].columns.length * ROW + 6 }))
    list.forEach((n, i) => { const r = Math.floor(i / cols); rowsH[r] = Math.max(rowsH[r] ?? 0, n.h) })
    list.forEach((n, i) => { const r = Math.floor(i / cols); n.y = rowsH.slice(0, r).reduce((s, h) => s + h + GAP_Y, 0) })
    return list
  }, [data])
  const byName = new Map(nodes.map((n) => [n.name, n]))
  const colY = (n: Node, c: string) => n.y + HEAD + Math.max(0, n.d.columns.findIndex((x) => x.name === c)) * ROW + ROW / 2

  const links = nodes.flatMap((n) => n.d.foreignKeys.map((f) => ({ from: n, to: byName.get(f.refTable), f }))).filter((l) => l.to)
  const match = (name: string) => q.trim() && name.toLowerCase().includes(q.trim().toLowerCase())

  const drag = useRef<{ x: number; y: number } | null>(null)
  const exportPng = async () => {
    const el = svg.current
    if (!el) return
    const bbox = { w: Math.max(...nodes.map((n) => n.x + W), 100) + 40, h: Math.max(...nodes.map((n) => n.y + n.h), 100) + 40 }
    const clone = el.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(bbox.w)); clone.setAttribute('height', String(bbox.h)); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.querySelector('g')!.setAttribute('transform', 'translate(20 20)')
    clone.insertAdjacentHTML('afterbegin', `<rect width="100%" height="100%" fill="#0f1520"/>`)
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
    const img = new Image()
    img.onload = async () => {
      const c = document.createElement('canvas'); c.width = bbox.w * 2; c.height = bbox.h * 2
      const g = c.getContext('2d')!; g.scale(2, 2); g.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `erd-${tab.ns}.png`; a.click()
    }
    img.src = url
  }
  const exportSql = async () => {
    const sql = nodes.map((n) => generateCreateTable(ctx(tab.connId).engine, designFromDetails(n.name, n.d))).join('\n\n')
    if (await bridge().fs.saveDialog(`${tab.ns}-schema.sql`, sql)) st.toast('success', 'Schema SQL exported')
  }

  if (!sess) return <div className="p-6 text-sm text-muted">Connection is not active.</div>
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-2 py-1.5 text-xs">
        <Search size={13} className="text-muted" />
        <input aria-label="Search tables" className="input !w-48 !py-1" placeholder="Search tables…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn !px-1.5" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}><Minus size={13} /></button>
        <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button className="btn !px-1.5" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}><Plus size={13} /></button>
        <button className="btn" onClick={() => { setZoom(1); setPan({ x: 20, y: 20 }) }}>Reset</button>
        <div className="flex-1" />
        {skipped > 0 && <span className="text-warn">Showing first {MAX_TABLES} tables ({skipped} more not drawn)</span>}
        <button className="btn" onClick={exportPng}><Download size={13} />Export image</button>
        <button className="btn" onClick={exportSql}><FileCode size={13} />Export SQL</button>
      </div>
      {err && <div role="alert" className="p-3 text-xs text-danger">{err}</div>}
      {!err && !nodes.length && <div className="p-6 text-xs text-muted" role="status">Loading schema…</div>}
      <svg ref={svg} className="min-h-0 flex-1 cursor-grab bg-bg active:cursor-grabbing" role="img" aria-label={`Entity relationship diagram for ${tab.ns}`}
        onWheel={(e) => setZoom((z) => Math.max(0.2, Math.min(2.5, z + (e.deltaY < 0 ? 0.08 : -0.08))))}
        onMouseDown={(e) => { drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y } }}
        onMouseMove={(e) => drag.current && setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
        onMouseUp={() => (drag.current = null)} onMouseLeave={() => (drag.current = null)}>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {links.map((l, i) => {
            const a = l.from, b = l.to!
            const right = b.x >= a.x
            const x1 = right ? a.x + W : a.x, x2 = right ? b.x : b.x + W
            const y1 = colY(a, l.f.column), y2 = colY(b, l.f.refColumn)
            const mx = (x1 + x2) / 2
            return <path key={i} d={`M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`} fill="none" stroke="rgb(34 190 220)" strokeWidth={1.4} strokeOpacity={0.8} markerEnd="url(#arrow)" />
          })}
          <defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="rgb(34 190 220)" /></marker></defs>
          {nodes.map((n) => (
            <g key={n.name} transform={`translate(${n.x} ${n.y})`}>
              <rect width={W} height={n.h} rx={6} fill="#171f2e" stroke={match(n.name) ? '#eaaa32' : '#242e42'} strokeWidth={match(n.name) ? 2.5 : 1} />
              <rect width={W} height={HEAD} rx={6} fill="#1f2a3e" />
              <text x={10} y={17} fill="#d6deeb" fontSize={12} fontWeight={600} fontFamily="JetBrains Mono, monospace">{n.name}</text>
              {n.d.columns.map((c, i) => (
                <g key={c.name}>
                  <text x={10} y={HEAD + i * ROW + 13} fontSize={10.5} fontFamily="JetBrains Mono, monospace" fill={c.key === 'PRI' ? '#eaaa32' : '#d6deeb'}>{c.key === 'PRI' ? '🔑 ' : ''}{c.name}</text>
                  <text x={W - 8} y={HEAD + i * ROW + 13} textAnchor="end" fontSize={9.5} fontFamily="JetBrains Mono, monospace" fill="#7886a0">{c.type.slice(0, 16)}</text>
                </g>
              ))}
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
