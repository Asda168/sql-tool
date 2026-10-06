import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Plus, RefreshCw, Save, Trash2, Undo2 } from 'lucide-react'
import { bridge } from '../bridge'
import { pageSql, qualified, quoteIdent, sqlLiteral } from '../lib/engines'
import type { ColumnInfo } from '../lib/introspect'
import { useApp, type Tab } from '../store/app'
import { EnvBadge } from '../components/ui'
import { ctx } from './actions'
import ResultsGrid from './ResultsGrid'

const PAGE = 200

/** Spreadsheet-style table editor. Changes stay local until "Save Changes", then run in ONE transaction after confirmation. */
export default function TableDataTab({ tab }: { tab: Extract<Tab, { kind: 'table' }> }) {
  const st = useApp()
  const sess = st.sessions[tab.connId]
  const cfg = st.connections.find((c) => c.id === tab.connId)
  const [cols, setCols] = useState<ColumnInfo[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<unknown[][]>([])
  const [loadedCount, setLoadedCount] = useState(0)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState<number | null>(null)
  const [where, setWhere] = useState('')
  const [appliedWhere, setAppliedWhere] = useState('')
  const [edits, setEdits] = useState<Map<number, Map<number, unknown>>>(new Map())
  const [deleted, setDeleted] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const pending = edits.size + deleted.size + (rows.length - loadedCount)
  const pkCols = useMemo(() => cols.filter((c) => c.key === 'PRI').map((c) => c.name), [cols])
  const editable = pkCols.length > 0

  const load = useCallback(async (p = page, w = appliedWhere) => {
    if (!sess) return
    setLoading(true); setErr('')
    try {
      const { engine, intro } = ctx(tab.connId)
      const details = await intro.details(tab.ns, tab.table)
      setCols(details.columns)
      const t = qualified(engine, tab.ns, tab.table)
      const r = await bridge().db.query(sess.sessionId, pageSql(engine, t, PAGE, p * PAGE, w), { maxRows: PAGE })
      setColumns(r.columns); setRows(r.rows); setLoadedCount(r.rows.length)
      setEdits(new Map()); setDeleted(new Set()); setSelected(null)
      bridge().db.query(sess.sessionId, `SELECT COUNT(*) FROM ${t}${w ? ' WHERE ' + w : ''}`, { maxRows: 1 }).then((c) => setTotal(Number(c.rows[0]?.[0] ?? 0)), () => setTotal(null))
    } catch (e) { setErr((e as Error).message ?? String(e)) }
    setLoading(false)
  }, [sess, tab.connId, tab.ns, tab.table, page, appliedWhere])

  useEffect(() => { void load() }, [sess?.sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sess || !cfg) return <div className="p-6 text-sm text-muted">Connection is not active. Reconnect from the Database panel, then reopen this table.</div>

  const guardPending = async () => pending === 0 || (await st.confirm({ title: 'Discard unsaved changes?', body: `${pending} pending change(s) will be lost.`, confirmLabel: 'Discard', danger: true }))
  const go = async (p: number) => { if (await guardPending()) { setPage(p); void load(p) } }
  const applyFilter = async () => { if (await guardPending()) { setAppliedWhere(where); setPage(0); void load(0, where) } }

  const onEdit = (r: number, c: number, v: string | null) => {
    if (r >= loadedCount) { setRows((rs) => rs.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row))); return }
    setEdits((m) => {
      const n = new Map(m)
      const row = new Map(n.get(r) ?? [])
      if (String(v ?? '\0') === String(rows[r][c] ?? '\0')) row.delete(c); else row.set(c, v)
      row.size ? n.set(r, row) : n.delete(r)
      return n
    })
  }
  const shown = rows.map((row, r) => (edits.has(r) ? row.map((v, c) => (edits.get(r)!.has(c) ? edits.get(r)!.get(c) : v)) : row))
  const editedKeys = new Set<string>(); edits.forEach((m, r) => m.forEach((_v, c) => editedKeys.add(`${r}:${c}`)))

  const addRow = () => { setRows((r) => [...r, columns.map(() => null)]); setSelected(rows.length) }
  const dupRow = () => { if (selected !== null) { setRows((r) => [...r, [...shown[selected]]]); setSelected(rows.length) } }
  const delRow = () => {
    if (selected === null) return
    if (selected >= loadedCount) { setRows((r) => r.filter((_, i) => i !== selected)); setSelected(null) } else setDeleted((d) => new Set(d).add(selected))
  }

  const save = async () => {
    const { engine } = ctx(tab.connId)
    const t = qualified(engine, tab.ns, tab.table)
    const q = (n: string) => quoteIdent(engine, n)
    const lit = (v: unknown) => sqlLiteral(engine, v)
    const wherePk = (row: unknown[]) => pkCols.map((c) => { const v = row[columns.indexOf(c)]; return v === null ? `${q(c)} IS NULL` : `${q(c)} = ${lit(v)}` }).join(' AND ')
    const stmts: string[] = []
    edits.forEach((m, r) => { if (!deleted.has(r)) stmts.push(`UPDATE ${t} SET ${[...m].map(([c, v]) => `${q(columns[c])} = ${lit(v)}`).join(', ')} WHERE ${wherePk(rows[r])}`) })
    deleted.forEach((r) => stmts.push(`DELETE FROM ${t} WHERE ${wherePk(rows[r])}`))
    rows.slice(loadedCount).forEach((row) => {
      const use = columns.map((_c, i) => i).filter((i) => row[i] !== null && row[i] !== '')
      stmts.push(use.length ? `INSERT INTO ${t} (${use.map((i) => q(columns[i])).join(', ')}) VALUES (${use.map((i) => lit(row[i])).join(', ')})` : `INSERT INTO ${t} DEFAULT VALUES`)
    })
    if (!stmts.length) return
    const ok = await st.confirm({
      title: 'Save changes to the database',
      body: `This will run ${stmts.length} statement(s) in a single transaction on "${cfg.name}": ${edits.size} update(s), ${deleted.size} delete(s), ${rows.length - loadedCount} insert(s).`,
      detail: stmts.slice(0, 6).concat(stmts.length > 6 ? [`… and ${stmts.length - 6} more`] : []),
      confirmLabel: 'Save Changes', danger: deleted.size > 0 || cfg.environment === 'production',
      banner: cfg.environment === 'production' ? 'PRODUCTION DATABASE' : undefined,
    })
    if (!ok) return
    try {
      const r = await bridge().db.transaction(sess.sessionId, stmts)
      st.toast('success', `Saved. ${r.affected} row(s) affected.`)
      void load()
    } catch (e) { setErr(`Save rolled back: ${(e as Error).message ?? e}`) }
  }

  const pages = total === null ? null : Math.max(1, Math.ceil(total / PAGE))
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-panel px-2 py-1.5 text-xs">
        <EnvBadge env={cfg.environment} />
        <span className="code font-semibold">{tab.table}</span>
        <div className="mx-1 h-4 w-px bg-line" />
        <button className="btn" onClick={addRow} disabled={!editable}><Plus size={13} />Add row</button>
        <button className="btn" onClick={dupRow} disabled={!editable || selected === null}><Copy size={13} />Duplicate</button>
        <button className="btn" onClick={delRow} disabled={!editable || selected === null}><Trash2 size={13} />Delete row</button>
        <button className="btn" onClick={async () => { if (await guardPending()) void load() }}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />Refresh</button>
        <div className="mx-1 h-4 w-px bg-line" />
        <button className="btn btn-primary" onClick={save} disabled={pending === 0}><Save size={13} />Save Changes{pending ? ` (${pending})` : ''}</button>
        <button className="btn" onClick={() => { setEdits(new Map()); setDeleted(new Set()); setRows((r) => r.slice(0, loadedCount)); setSelected(null) }} disabled={pending === 0}><Undo2 size={13} />Cancel Changes</button>
        <div className="flex-1" />
        <input aria-label="WHERE clause" className="input code !w-64 !py-1" placeholder="WHERE … (e.g. status = 'active')" value={where} onChange={(e) => setWhere(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilter()} />
        <button className="btn" onClick={applyFilter}>Filter</button>
        <button className="btn !px-1.5" aria-label="Previous page" disabled={page === 0} onClick={() => go(page - 1)}><ChevronLeft size={13} /></button>
        <span className="tabular-nums">{page + 1}{pages ? ` / ${pages}` : ''}{total !== null ? ` · ${total.toLocaleString()} rows` : ''}</span>
        <button className="btn !px-1.5" aria-label="Next page" disabled={pages !== null ? page + 1 >= pages : rows.length < PAGE} onClick={() => go(page + 1)}><ChevronRight size={13} /></button>
      </div>
      {!editable && cols.length > 0 && <div className="shrink-0 border-b border-warn/40 bg-warn/10 px-3 py-1 text-xs text-warn">This table has no primary key, so it is read-only (edits could not target a single row safely).</div>}
      {err && <div role="alert" className="shrink-0 whitespace-pre-wrap border-b border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger">{err}</div>}
      <div className="min-h-0 flex-1">
        <ResultsGrid columns={columns} rows={shown} engine={sess.engine} tableName={tab.table} editable={editable}
          edited={editedKeys} rowState={(r) => (r >= loadedCount ? 'new' : deleted.has(r) ? 'deleted' : undefined)}
          readOnlyCols={new Set()} onEdit={onEdit} selected={selected} onSelect={setSelected} />
      </div>
    </div>
  )
}
