import { useEffect, useMemo, useState } from 'react'
import { Pencil, Save, Trash2, Undo2 } from 'lucide-react'
import { bridge, type QueryResult } from '../bridge'
import { buildStatements } from '../lib/dataEdit'
import { singleTableOf } from '../lib/sqlTable'
import { useApp, type TabResult } from '../store/app'
import ResultsGrid from './ResultsGrid'

/**
 * Query results with an optional **Edit Data** mode.
 * Editing is offered only when the query is a plain single-table SELECT that includes the table's primary key,
 * because every change must target exactly one row. Changes are written in one transaction after a confirmation.
 */
export default function QueryResultGrid({ tabId, res, result }: { tabId: string; res: TabResult; result: QueryResult }) {
  const connId = res.connId
  const cfg = useApp((s) => s.connections.find((c) => c.id === connId))
  const sess = useApp((s) => (connId ? s.sessions[connId] : undefined))
  const selectedNs = useApp((s) => (connId ? s.selectedNs[connId] : undefined))
  const source = useMemo(() => (res.sql ? singleTableOf(res.sql) : null), [res.sql])
  const ns = source?.ns ?? selectedNs ?? cfg?.database ?? (sess?.engine === 'sqlite' ? 'main' : undefined)
  const info = useApp((s) => (connId && ns ? s.schemaCache[connId]?.[ns] : undefined))
  const [editMode, setEditMode] = useState(false)
  const [edits, setEdits] = useState<Map<number, Map<number, unknown>>>(new Map())
  const [deleted, setDeleted] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<number | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => { if (connId && ns && source && !info) void useApp.getState().loadNs(connId, ns) }, [connId, ns, source, info])
  // a fresh result always starts read-only
  useEffect(() => { setEditMode(false); setEdits(new Map()); setDeleted(new Set()); setSelected(null); setErr('') }, [result])

  const tableName = source && info ? Object.keys(info.tables).find((t) => t.toLowerCase() === source.table.toLowerCase()) : undefined
  const pkCols = tableName ? info!.tables[tableName].columns.filter((c) => c.key === 'PRI').map((c) => c.name) : []
  const missingPk = pkCols.filter((c) => !result.columns.some((x) => x.toLowerCase() === c.toLowerCase()))
  const reason = !source ? 'Edit Data works on a plain single-table SELECT (no JOIN, GROUP BY, DISTINCT or subquery).'
    : !info ? 'Loading the table structure…'
      : !tableName ? `Table "${source.table}" was not found in ${ns}.`
        : !pkCols.length ? `"${tableName}" has no primary key, so rows cannot be changed safely.`
          : missingPk.length ? `Include the primary key column${missingPk.length > 1 ? 's' : ''} (${missingPk.join(', ')}) in the SELECT to edit.`
            : ''
  const canEdit = !reason
  const pending = edits.size + deleted.size

  const shown = useMemo(() => result.rows.map((row, r) => (edits.has(r) ? row.map((v, c) => (edits.get(r)!.has(c) ? edits.get(r)!.get(c) : v)) : row)), [result.rows, edits])
  const editedKeys = useMemo(() => { const k = new Set<string>(); edits.forEach((m, r) => m.forEach((_v, c) => k.add(`${r}:${c}`))); return k }, [edits])
  const pkReal = pkCols.map((c) => result.columns.find((x) => x.toLowerCase() === c.toLowerCase()) ?? c)

  const onEdit = (r: number, c: number, v: string | null) => setEdits((m) => {
    const n = new Map(m); const row = new Map(n.get(r) ?? [])
    if (String(v ?? '\0') === String(result.rows[r][c] ?? '\0')) row.delete(c); else row.set(c, v)
    row.size ? n.set(r, row) : n.delete(r)
    return n
  })

  const discard = () => { setEdits(new Map()); setDeleted(new Set()); setSelected(null); setErr('') }
  const toggle = async () => {
    const st = useApp.getState()
    if (editMode) {
      if (pending && !(await st.confirm({ title: 'Discard unsaved changes?', body: `${pending} pending change(s) will be lost.`, confirmLabel: 'Discard', danger: true }))) return
      discard(); setEditMode(false); return
    }
    if (cfg?.environment === 'production' && !(await st.confirm({ title: 'Edit data on a PRODUCTION database?', body: `You are about to enable editing of "${tableName}" on "${cfg.name}". Nothing is written until you press Save Changes and confirm.`, confirmLabel: 'Enable editing', danger: true, banner: 'PRODUCTION DATABASE' }))) return
    setEditMode(true)
  }

  const save = async () => {
    if (!sess || !cfg || !tableName) return
    const st = useApp.getState()
    let stmts: string[]
    try { stmts = buildStatements({ engine: sess.engine, ns, table: tableName, columns: result.columns, pkCols: pkReal, rows: result.rows, loadedCount: result.rows.length, edits, deleted }) } catch (e) { return setErr((e as Error).message) }
    if (!stmts.length) return
    const ok = await st.confirm({
      title: 'Save changes to the database',
      body: `This will run ${stmts.length} statement(s) in a single transaction on "${cfg.name}": ${edits.size} update(s), ${deleted.size} delete(s).`,
      detail: stmts.slice(0, 6).concat(stmts.length > 6 ? [`… and ${stmts.length - 6} more`] : []),
      confirmLabel: 'Save Changes', danger: deleted.size > 0 || cfg.environment === 'production', banner: cfg.environment === 'production' ? 'PRODUCTION DATABASE' : undefined,
    })
    if (!ok) return
    try {
      const r = await bridge().db.transaction(sess.sessionId, stmts)
      st.toast('success', `Saved. ${r.affected} row(s) affected.`)
      // refresh the same query so the grid shows what is really in the database
      const fresh = await bridge().db.query(sess.sessionId, res.sql!, { maxRows: st.settings.rowLimit, database: selectedNs })
      useApp.setState((s) => ({ results: { ...s.results, [tabId]: { ...s.results[tabId], result: fresh } } }))
    } catch (e) { setErr(`Save rolled back: ${(e as Error).message ?? e}`) }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2 py-1 text-xs">
        <button className={`btn ${editMode ? 'border-accent bg-accent/15 text-accent' : ''}`} aria-pressed={editMode} disabled={!canEdit} title={canEdit ? 'Change rows of this table directly in the results' : reason} onClick={toggle}><Pencil size={13} />{editMode ? 'Editing' : 'Edit Data'}</button>
        {editMode ? (
          <>
            <button className="btn btn-primary" disabled={!pending} onClick={save}><Save size={13} />Save Changes{pending ? ` (${pending})` : ''}</button>
            <button className="btn" disabled={!pending} onClick={discard}><Undo2 size={13} />Cancel Changes</button>
            <button className="btn" disabled={selected === null || deleted.has(selected)} onClick={() => selected !== null && setDeleted((d) => new Set(d).add(selected))}><Trash2 size={13} />Delete row</button>
            <span className="text-muted">Editing <span className="code">{tableName}</span> · double-click a cell</span>
          </>
        ) : !canEdit && source ? <span className="truncate text-muted" title={reason}>Read-only: {reason}</span> : !source ? <span className="truncate text-muted">Read-only results</span> : null}
      </div>
      {err && <div role="alert" className="shrink-0 whitespace-pre-wrap border-b border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger">{err}</div>}
      <div className="min-h-0 flex-1">
        <ResultsGrid columns={result.columns} rows={shown} engine={sess?.engine ?? 'mysql'} tableName={tableName} truncated={result.truncated}
          editable={editMode} edited={editedKeys} rowState={(r) => (deleted.has(r) ? 'deleted' : undefined)} onEdit={onEdit} selected={selected} onSelect={setSelected} />
      </div>
    </div>
  )
}
