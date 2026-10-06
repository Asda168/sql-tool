import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { COLUMN_TYPES, alterAddColumn, alterDropColumn, alterModifyColumn, blankColumn, type DesignColumn } from '../lib/codegen'
import { qualified, quoteIdent } from '../lib/engines'
import type { TableDetails } from '../lib/introspect'
import { useApp, type Tab } from '../store/app'
import { Field, Modal } from '../components/ui'
import { ctx, designFromDetails, runDdl } from './actions'

type View = 'structure' | 'indexes' | 'fks'

function ColumnDialog({ initial, engine, title, onSave, onClose }: { initial: DesignColumn; engine: keyof typeof COLUMN_TYPES; title: string; onSave: (c: DesignColumn) => void; onClose: () => void }) {
  const [c, setC] = useState(initial)
  const set = (p: Partial<DesignColumn>) => setC((x) => ({ ...x, ...p }))
  const types = [...new Set([c.type, ...COLUMN_TYPES[engine]])]
  return (
    <Modal title={title} onClose={onClose} width="max-w-md">
      <form className="grid grid-cols-2 gap-3 p-4" onSubmit={(e) => { e.preventDefault(); if (c.name.trim()) onSave({ ...c, name: c.name.trim() }) }}>
        <div className="col-span-2"><Field label="Column name"><input autoFocus className="input code" value={c.name} onChange={(e) => set({ name: e.target.value })} /></Field></div>
        <Field label="Type"><select className="input" value={c.type} onChange={(e) => set({ type: e.target.value })}>{types.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Length"><input className="input code" value={c.length} onChange={(e) => set({ length: e.target.value })} placeholder="255" /></Field>
        <div className="col-span-2"><Field label="Default"><input className="input code" value={c.default} onChange={(e) => set({ default: e.target.value })} placeholder="NULL, 0, CURRENT_TIMESTAMP, text…" /></Field></div>
        <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={c.nullable} onChange={(e) => set({ nullable: e.target.checked })} />Allow NULL</label>
        <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!c.name.trim()}>Review SQL</button></div>
      </form>
    </Modal>
  )
}

/** Structure / Indexes / Foreign Keys of a table. Schema changes are generated as ALTER statements and confirmed first. */
export default function TableStructure({ tab, view }: { tab: Extract<Tab, { kind: 'table' }>; view: View }) {
  const st = useApp()
  const sess = st.sessions[tab.connId]
  const [d, setD] = useState<TableDetails | null>(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<{ mode: 'add' | 'edit'; col: DesignColumn; old?: string } | null>(null)

  const load = useCallback(async () => {
    try { setD(await ctx(tab.connId).intro.details(tab.ns, tab.table)); setErr('') } catch (e) { setErr((e as Error).message ?? String(e)) }
  }, [tab.connId, tab.ns, tab.table])
  useEffect(() => { if (sess) void load() }, [sess?.sessionId, load]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!sess) return <div className="p-6 text-sm text-muted">Connection is not active.</div>
  if (err) return <div role="alert" className="p-4 text-xs text-danger">{err}</div>
  if (!d) return <div className="p-4 text-xs text-muted">Loading…</div>

  const engine = sess.engine
  const t = qualified(engine, tab.ns, tab.table)
  const run = async (sql: string[], what: string, danger: boolean) => { try { if (await runDdl(tab.connId, sql, what, danger)) { setSel(null); await load() } } catch (e) { st.toast('error', (e as Error).message ?? String(e)) } }
  const design = designFromDetails(tab.table, d)
  const selected = design.columns.find((c) => c.name === sel)

  const save = (c: DesignColumn) => {
    const dlgState = dlg!
    setDlg(null)
    try {
      if (dlgState.mode === 'add') void run([alterAddColumn(engine, t, c)], `Add column "${c.name}" to "${tab.table}"`, false)
      else void run(alterModifyColumn(engine, t, dlgState.old!, c), `Change column "${dlgState.old}" in "${tab.table}"`, true)
    } catch (e) { st.toast('error', (e as Error).message) }
  }

  if (view === 'indexes') {
    return (
      <div className="h-full overflow-auto p-4">
        <table className="w-full max-w-3xl text-xs"><thead className="text-left text-[10px] uppercase tracking-widest text-muted"><tr><th className="py-1.5">Name</th><th>Columns</th><th>Unique</th></tr></thead>
          <tbody>{d.indexes.map((i) => <tr key={i.name} className="border-t border-line"><td className="code py-1.5">{i.name}</td><td className="code">{i.columns.join(', ')}</td><td>{i.unique ? 'YES' : 'NO'}</td></tr>)}</tbody></table>
        {!d.indexes.length && <p className="text-xs text-muted">No indexes.</p>}
      </div>
    )
  }
  if (view === 'fks') {
    return (
      <div className="h-full overflow-auto p-4">
        <table className="w-full max-w-3xl text-xs"><thead className="text-left text-[10px] uppercase tracking-widest text-muted"><tr><th className="py-1.5">Name</th><th>Column</th><th>References</th></tr></thead>
          <tbody>{d.foreignKeys.map((f) => <tr key={f.name + f.column} className="border-t border-line"><td className="code py-1.5">{f.name}</td><td className="code">{f.column}</td><td className="code">{f.refTable}.{f.refColumn}</td></tr>)}</tbody></table>
        {!d.foreignKeys.length && <p className="text-xs text-muted">No foreign keys.</p>}
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line bg-panel px-2 py-1.5 text-xs">
        <button className="btn" onClick={() => setDlg({ mode: 'add', col: blankColumn() })}><Plus size={13} />Add Column</button>
        <button className="btn" disabled={!selected} onClick={() => selected && setDlg({ mode: 'edit', col: selected, old: selected.name })} title={engine === 'sqlite' ? 'SQLite cannot alter columns in place' : undefined}><Pencil size={13} />Edit</button>
        <button className="btn" disabled={!selected} onClick={() => selected && void run([alterDropColumn(engine, t, selected.name)], `Permanently delete column "${selected.name}" and its data`, true)}><Trash2 size={13} />Delete</button>
        <span className="ml-2 text-muted">{d.columns.length} columns</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-raised text-left text-[10px] uppercase tracking-widest text-muted"><tr><th className="px-3 py-1.5">Column</th><th>Type</th><th>Null</th><th>Key</th><th>Default</th><th>Extra</th><th>Comment</th></tr></thead>
          <tbody>
            {d.columns.map((c) => (
              <tr key={c.name} aria-selected={sel === c.name} onClick={() => setSel(c.name)} className={`cursor-pointer border-t border-line/60 ${sel === c.name ? 'bg-accent/15' : 'hover:bg-raised/60'}`}>
                <td className="code px-3 py-1.5 font-medium">{c.name}</td><td className="code">{c.type}</td><td>{c.nullable ? 'YES' : 'NO'}</td>
                <td>{c.key ? <span className="rounded border border-line px-1 text-[10px]">{c.key}</span> : ''}</td><td className="code text-muted">{c.default ?? <i>NULL</i>}</td><td className="text-muted">{c.extra}</td><td className="text-muted">{c.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dlg && <ColumnDialog initial={dlg.col} engine={engine} title={dlg.mode === 'add' ? 'Add Column' : `Edit Column: ${dlg.old}`} onSave={save} onClose={() => setDlg(null)} />}
    </div>
  )
}

export { quoteIdent }
