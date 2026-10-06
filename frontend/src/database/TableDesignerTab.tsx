import { useEffect, useMemo, useState } from 'react'
import { Copy, Play, Plus, Trash2 } from 'lucide-react'
import { COLUMN_TYPES, blankColumn, generateCreateTable, type DesignFk, type DesignIndex, type TableDesign } from '../lib/codegen'
import { ENGINES } from '../lib/engines'
import { useApp, type Tab } from '../store/app'
import { Field } from '../components/ui'
import CodeEditor from '../editor/CodeEditor'
import { ctx, designFromDetails, runDdl } from './actions'

const starter = (): TableDesign => ({
  name: 'users',
  columns: [
    { name: 'id', type: 'INT', length: '', nullable: false, primaryKey: true, autoIncrement: true, unique: false, default: '' },
    { name: 'name', type: 'VARCHAR', length: '255', nullable: false, primaryKey: false, autoIncrement: false, unique: false, default: '' },
    { name: 'email', type: 'VARCHAR', length: '255', nullable: true, primaryKey: false, autoIncrement: false, unique: true, default: '' },
    { name: 'created_at', type: 'TIMESTAMP', length: '', nullable: false, primaryKey: false, autoIncrement: false, unique: false, default: 'CURRENT_TIMESTAMP' },
  ],
  indexes: [], foreignKeys: [],
})

/** Visual table designer. SQL is generated live; creating a table requires an explicit click and confirmation. */
export default function TableDesignerTab({ tab }: { tab: Extract<Tab, { kind: 'designer' }> }) {
  const st = useApp()
  const sess = st.sessions[tab.connId]
  const engine = sess?.engine ?? 'mysql'
  const [d, setD] = useState<TableDesign>(() => (tab.table ? { name: tab.table, columns: [], indexes: [], foreignKeys: [] } : starter()))
  const [tables, setTables] = useState<string[]>([])
  const existing = !!tab.table

  useEffect(() => {
    if (!sess) return
    const { intro } = ctx(tab.connId)
    intro.tables(tab.ns).then((t) => setTables(t.map((x) => x.name)), () => {})
    if (tab.table) intro.details(tab.ns, tab.table).then((det) => setD(designFromDetails(tab.table!, det)), (e) => st.toast('error', e.message))
  }, [sess?.sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sql = useMemo(() => generateCreateTable(engine, d), [engine, d])
  const setCol = (i: number, p: Partial<TableDesign['columns'][number]>) => setD((x) => ({ ...x, columns: x.columns.map((c, j) => (j === i ? { ...c, ...p } : c)) }))
  const colNames = d.columns.map((c) => c.name).filter(Boolean)
  const valid = d.name.trim() && d.columns.length > 0 && d.columns.every((c) => c.name.trim())

  const create = async () => {
    if (!sess) return
    const ok = await runDdl(tab.connId, [sql.replace(/;\s*$/m, '').split(/;\s*\n/)[0], ...sql.split(/;\s*\n/).slice(1).map((s) => s.replace(/;\s*$/, ''))].filter(Boolean), `Create table "${d.name}"`, false)
    if (ok) { st.toast('success', `Table ${d.name} created`); st.closeTab(tab.id) }
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-3 flex items-end gap-3">
          <div className="w-64"><Field label="Table name"><input className="input code" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field></div>
          <span className="pb-1.5 text-xs text-muted">{ENGINES[engine].label} · {tab.ns}</span>
        </div>
        {existing && <p className="mb-3 rounded-md border border-accent/40 bg-accent/10 p-2 text-xs">Viewing the current structure. Altering existing tables is done with SQL: copy the generated statement into a query tab and adapt it (ALTER requires confirmation).</p>}

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Columns</h3>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead className="bg-raised text-left text-muted"><tr>{['Name', 'Type', 'Length', 'Null', 'PK', 'AI', 'Unique', 'Default', ''].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {d.columns.map((c, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="p-1"><input aria-label="Column name" className="input code !py-1" value={c.name} onChange={(e) => setCol(i, { name: e.target.value })} /></td>
                  <td className="p-1"><select aria-label="Type" className="input !py-1" value={c.type} onChange={(e) => setCol(i, { type: e.target.value })}>{[...new Set([c.type, ...COLUMN_TYPES[engine]])].map((t) => <option key={t}>{t}</option>)}</select></td>
                  <td className="w-20 p-1"><input aria-label="Length" className="input code !py-1" value={c.length} onChange={(e) => setCol(i, { length: e.target.value })} /></td>
                  <td className="p-1 text-center"><input type="checkbox" aria-label="Nullable" checked={c.nullable && !c.primaryKey} disabled={c.primaryKey} onChange={(e) => setCol(i, { nullable: e.target.checked })} /></td>
                  <td className="p-1 text-center"><input type="checkbox" aria-label="Primary key" checked={c.primaryKey} onChange={(e) => setCol(i, { primaryKey: e.target.checked, nullable: false })} /></td>
                  <td className="p-1 text-center"><input type="checkbox" aria-label="Auto increment" checked={c.autoIncrement} onChange={(e) => setCol(i, { autoIncrement: e.target.checked })} /></td>
                  <td className="p-1 text-center"><input type="checkbox" aria-label="Unique" checked={c.unique} onChange={(e) => setCol(i, { unique: e.target.checked })} /></td>
                  <td className="p-1"><input aria-label="Default" className="input code !py-1" value={c.default} onChange={(e) => setCol(i, { default: e.target.value })} /></td>
                  <td className="p-1"><button className="text-muted hover:text-danger" aria-label="Delete column" onClick={() => setD({ ...d, columns: d.columns.filter((_, j) => j !== i) })}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn mt-2" onClick={() => setD({ ...d, columns: [...d.columns, blankColumn()] })}><Plus size={13} />Add Column</button>

        <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Indexes</h3>
        {d.indexes.map((ix: DesignIndex, i) => (
          <div key={i} className="mb-1 flex items-center gap-2 text-xs">
            <input aria-label="Index name" className="input code !w-44 !py-1" placeholder="idx_name" value={ix.name} onChange={(e) => setD({ ...d, indexes: d.indexes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <select aria-label="Index column" className="input !w-40 !py-1" value={ix.columns[0] ?? ''} onChange={(e) => setD({ ...d, indexes: d.indexes.map((x, j) => (j === i ? { ...x, columns: e.target.value ? [e.target.value] : [] } : x)) })}><option value="">column…</option>{colNames.map((n) => <option key={n}>{n}</option>)}</select>
            <label className="flex items-center gap-1"><input type="checkbox" checked={ix.unique} onChange={(e) => setD({ ...d, indexes: d.indexes.map((x, j) => (j === i ? { ...x, unique: e.target.checked } : x)) })} />Unique</label>
            <button aria-label="Remove index" className="text-muted hover:text-danger" onClick={() => setD({ ...d, indexes: d.indexes.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
          </div>
        ))}
        <button className="btn" onClick={() => setD({ ...d, indexes: [...d.indexes, { name: '', columns: [], unique: false }] })}><Plus size={13} />Add Index</button>

        <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Foreign keys</h3>
        {d.foreignKeys.map((f: DesignFk, i) => (
          <div key={i} className="mb-1 flex flex-wrap items-center gap-2 text-xs">
            <select aria-label="Local column" className="input !w-36 !py-1" value={f.column} onChange={(e) => setD({ ...d, foreignKeys: d.foreignKeys.map((x, j) => (j === i ? { ...x, column: e.target.value } : x)) })}><option value="">column…</option>{colNames.map((n) => <option key={n}>{n}</option>)}</select>
            <span>→</span>
            <select aria-label="Referenced table" className="input !w-36 !py-1" value={f.refTable} onChange={(e) => setD({ ...d, foreignKeys: d.foreignKeys.map((x, j) => (j === i ? { ...x, refTable: e.target.value } : x)) })}><option value="">table…</option>{tables.map((n) => <option key={n}>{n}</option>)}</select>
            <input aria-label="Referenced column" className="input code !w-28 !py-1" placeholder="id" value={f.refColumn} onChange={(e) => setD({ ...d, foreignKeys: d.foreignKeys.map((x, j) => (j === i ? { ...x, refColumn: e.target.value } : x)) })} />
            <select aria-label="On delete" className="input !w-32 !py-1" value={f.onDelete} onChange={(e) => setD({ ...d, foreignKeys: d.foreignKeys.map((x, j) => (j === i ? { ...x, onDelete: e.target.value } : x)) })}><option value="">ON DELETE…</option><option>CASCADE</option><option>SET NULL</option><option>RESTRICT</option></select>
            <button aria-label="Remove foreign key" className="text-muted hover:text-danger" onClick={() => setD({ ...d, foreignKeys: d.foreignKeys.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
          </div>
        ))}
        <button className="btn" onClick={() => setD({ ...d, foreignKeys: [...d.foreignKeys, { name: '', column: '', refTable: '', refColumn: 'id', onDelete: '' }] })}><Plus size={13} />Add Foreign Key</button>
      </div>

      <div className="flex min-h-[220px] flex-col border-t border-line md:w-[42%] md:border-l md:border-t-0">
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs">
          <span className="font-semibold">Generated SQL</span><div className="flex-1" />
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(sql); st.toast('info', 'SQL copied') }}><Copy size={12} />Copy</button>
          <button className="btn" onClick={() => { const id = st.newSqlTab(sql, `${d.name}.sql`); st.updateTab(id, { connId: tab.connId }) }}>Open in editor</button>
          {!existing && <button className="btn btn-primary" disabled={!valid || !sess} onClick={create}><Play size={12} />Create table</button>}
        </div>
        <div className="min-h-0 flex-1"><CodeEditor path={`tab-${tab.id}-gen.sql`} language="sql" value={sql} onChange={() => {}} readOnly /></div>
      </div>
    </div>
  )
}
