import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Database, Eye, KeyRound, Link2, Plug, PlugZap, Plus, RefreshCw, Table2, Unplug, Zap } from 'lucide-react'
import { ENGINES, ENVIRONMENTS } from '../lib/engines'
import type { ColumnInfo, NamedObject, TableDetails, TableRef } from '../lib/introspect'
import { uid, useApp } from '../store/app'
import { EnvBadge, Empty, useContextMenu } from '../components/ui'
import { ctx, designFromDetails, dropSql, duplicateSql, generateSql, renameSql, runDdl } from './actions'

function Row({ depth, open, onToggle, icon, label, right, onClick, onDoubleClick, onContext, title }: { depth: number; open?: boolean; onToggle?: () => void; icon?: ReactNode; label: ReactNode; right?: ReactNode; onClick?: () => void; onDoubleClick?: () => void; onContext?: (e: React.MouseEvent) => void; title?: string }) {
  return (
    <div role="treeitem" aria-expanded={onToggle ? !!open : undefined} title={title} className="group flex cursor-pointer items-center gap-1 rounded px-1 py-[3px] text-xs hover:bg-raised" style={{ paddingLeft: 4 + depth * 12 }}
      onClick={() => { onToggle?.(); onClick?.() }} onDoubleClick={onDoubleClick} onContextMenu={onContext}>
      <span className="w-3 shrink-0 text-muted">{onToggle ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
      {icon}
      <span className="truncate">{label}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1 pl-1 text-[10px] text-muted">{right}</span>
    </div>
  )
}

function useLoad<T>(enabled: boolean, fn: () => Promise<T>, deps: unknown[]) {
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

function ColumnsList({ connId, ns, table, depth }: { connId: string; ns: string; table: string; depth: number }) {
  const { data, err } = useLoad<TableDetails>(true, () => ctx(connId).intro.details(ns, table), [connId, ns, table])
  if (err) return <div className="px-2 text-[11px] text-danger" style={{ paddingLeft: 16 + depth * 12 }}>{err}</div>
  if (!data) return <div className="px-2 text-[11px] text-muted" style={{ paddingLeft: 16 + depth * 12 }}>Loading…</div>
  const fkCols = new Set(data.foreignKeys.map((f) => f.column))
  const badge = (c: ColumnInfo) => c.key === 'PRI' ? <KeyRound size={11} className="text-warn" aria-label="Primary key" /> : fkCols.has(c.name) ? <Link2 size={11} className="text-accent" aria-label="Foreign key" /> : null
  return (
    <>
      {data.columns.map((c) => (
        <Row key={c.name} depth={depth} icon={badge(c) ?? <span className="w-[11px]" />} label={<span className="code text-[11px]">{c.name}</span>}
          title={[c.type, c.nullable ? 'nullable' : 'NOT NULL', c.default !== null ? `default ${c.default}` : '', c.extra, c.comment].filter(Boolean).join(' · ')}
          right={<span className="code">{c.type}{c.nullable ? '' : ' ·NN'}</span>} />
      ))}
      {data.indexes.map((i) => <Row key={'i' + i.name} depth={depth} icon={<span className="w-[11px] text-[9px] text-muted">IX</span>} label={<span className="text-[11px]">{i.name}</span>} right={`${i.unique ? 'unique ' : ''}(${i.columns.join(', ')})`} />)}
      {data.foreignKeys.map((f) => <Row key={'f' + f.name + f.column} depth={depth} icon={<Link2 size={11} className="text-accent" />} label={<span className="text-[11px]">{f.column}</span>} right={`→ ${f.refTable}.${f.refColumn}`} />)}
    </>
  )
}

function TableNode({ connId, ns, t, depth, onChanged }: { connId: string; ns: string; t: TableRef; depth: number; onChanged: () => void }) {
  const st = useApp()
  const [open, setOpen] = useState(false)
  const { menu, open: ctxOpen } = useContextMenu()
  const openData = () => st.openTab({ id: `tbl:${connId}:${ns}:${t.name}`, kind: 'table', title: t.name, connId, ns, table: t.name })
  const sqlTab = async (kind: Parameters<typeof generateSql>[3]) => {
    try { const id = st.newSqlTab(await generateSql(connId, ns, t.name, kind), `${t.name}.${kind}.sql`); st.updateTab(id, { connId }) } catch (e) { st.toast('error', (e as Error).message) }
  }
  const guard = async (fn: () => Promise<unknown>) => { try { await fn() } catch (e) { st.toast('error', (e as Error).message ?? String(e)) } }
  const { engine } = (() => { try { return ctx(connId) } catch { return { engine: 'mysql' as const } } })()

  return (
    <>
      <Row depth={depth} open={open} onToggle={() => setOpen(!open)} icon={t.kind === 'view' ? <Eye size={13} className="text-muted" /> : <Table2 size={13} className="text-accent" />} label={t.name}
        onDoubleClick={openData} title={t.comment || t.name}
        onContext={(e) => ctxOpen(e, [
          { label: 'Open Table', onClick: openData },
          { label: 'Edit Table', onClick: () => st.openTab({ id: `dsg:${connId}:${ns}:${t.name}`, kind: 'designer', title: `Edit ${t.name}`, connId, ns, table: t.name }), disabled: t.kind === 'view' },
          { label: 'Create Table', onClick: () => st.openTab({ id: `dsg:${connId}:${ns}:new:${uid()}`, kind: 'designer', title: 'New table', connId, ns }) },
          { sep: true, label: '', onClick: () => {} },
          { label: 'Rename…', onClick: () => guard(async () => { const n = await st.prompt({ title: 'Rename table', label: 'New name', initial: t.name, confirmLabel: 'Rename' }); if (n && n !== t.name && await runDdl(connId, [renameSql(engine, ns, t.name, n)], `Rename "${t.name}" to "${n}"`, false)) onChanged() }), disabled: t.kind === 'view' },
          { label: 'Duplicate…', onClick: () => guard(async () => { const n = await st.prompt({ title: 'Duplicate table', label: 'Name of the copy', initial: `${t.name}_copy`, confirmLabel: 'Duplicate' }); if (n && await runDdl(connId, duplicateSql(engine, ns, t.name, n), `Copy "${t.name}" (structure and data) to "${n}"`, false)) onChanged() }), disabled: t.kind === 'view' },
          { label: 'Delete…', danger: true, onClick: () => guard(async () => { if (await runDdl(connId, [dropSql(engine, ns, t.name, t.kind === 'view')], `Permanently delete ${t.kind} "${t.name}"`)) onChanged() }) },
          { sep: true, label: '', onClick: () => {} },
          { label: 'Generate SQL: SELECT', onClick: () => sqlTab('select') }, { label: 'Generate SQL: INSERT', onClick: () => sqlTab('insert') },
          { label: 'Generate SQL: UPDATE', onClick: () => sqlTab('update') }, { label: 'Generate SQL: DELETE', onClick: () => sqlTab('delete') },
          { label: 'Generate SQL: CREATE TABLE', onClick: () => sqlTab('create') },
          { sep: true, label: '', onClick: () => {} },
          { label: 'Copy table name', onClick: () => navigator.clipboard?.writeText(t.name) },
        ])} />
      {open && <ColumnsList connId={connId} ns={ns} table={t.name} depth={depth + 1} />}
      {menu}
    </>
  )
}

function ObjectCategory({ connId, ns, kind, depth }: { connId: string; ns: string; kind: 'procedures' | 'functions' | 'triggers' | 'events'; depth: number }) {
  const [open, setOpen] = useState(false)
  const { data, err } = useLoad<NamedObject[]>(open, () => ctx(connId).intro.objects(ns, kind), [connId, ns, kind])
  const label = kind[0].toUpperCase() + kind.slice(1)
  return (
    <>
      <Row depth={depth} open={open} onToggle={() => setOpen(!open)} label={label} icon={<Zap size={12} className="text-muted" />} right={data ? data.length : ''} />
      {open && err && <div className="px-6 text-[11px] text-danger">{err}</div>}
      {open && data?.map((o) => <Row key={o.name} depth={depth + 1} label={<span className="code text-[11px]">{o.name}</span>} right={o.detail} />)}
      {open && data && !data.length && <div className="px-8 py-0.5 text-[11px] text-muted">None</div>}
    </>
  )
}

function Namespace({ connId, ns, depth, initiallyOpen }: { connId: string; ns: string; depth: number; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  const [tablesOpen, setTablesOpen] = useState(true)
  const [viewsOpen, setViewsOpen] = useState(false)
  const { data, err, reload } = useLoad<TableRef[]>(open, () => ctx(connId).intro.tables(ns), [connId, ns])
  const { engine } = ctx(connId)
  const info = ENGINES[engine]
  const st = useApp()
  const tables = data?.filter((t) => t.kind === 'table') ?? []
  const views = data?.filter((t) => t.kind === 'view') ?? []
  const changed = useCallback(() => { reload(); void st.refreshSchema(connId, ns) }, [reload, st, connId, ns])
  const { menu, open: ctxOpen } = useContextMenu()
  return (
    <>
      <Row depth={depth} open={open} onToggle={() => setOpen(!open)} icon={<Database size={13} className="text-accent" />} label={ns} title={`${info.namespace} ${ns}`}
        onContext={(e) => ctxOpen(e, [
          { label: 'Create Table', onClick: () => st.openTab({ id: `dsg:${connId}:${ns}:new:${uid()}`, kind: 'designer', title: 'New table', connId, ns }) },
          { label: 'Show ERD', onClick: () => st.openTab({ id: `erd:${connId}:${ns}`, kind: 'erd', title: `ERD ${ns}`, connId, ns }) },
          { label: 'Refresh', onClick: changed },
        ])} />
      {menu}
      {open && err && <div className="px-6 py-1 text-[11px] text-danger">{err}</div>}
      {open && !data && !err && <div className="px-6 py-1 text-[11px] text-muted">Loading…</div>}
      {open && data && (
        <>
          <Row depth={depth + 1} open={tablesOpen} onToggle={() => setTablesOpen(!tablesOpen)} icon={<Table2 size={12} className="text-muted" />} label="Tables" right={tables.length} />
          {tablesOpen && tables.map((t) => <TableNode key={t.name} connId={connId} ns={ns} t={t} depth={depth + 2} onChanged={changed} />)}
          <Row depth={depth + 1} open={viewsOpen} onToggle={() => setViewsOpen(!viewsOpen)} icon={<Eye size={12} className="text-muted" />} label="Views" right={views.length} />
          {viewsOpen && views.map((t) => <TableNode key={t.name} connId={connId} ns={ns} t={t} depth={depth + 2} onChanged={changed} />)}
          {info.supportsRoutines && <ObjectCategory connId={connId} ns={ns} kind="procedures" depth={depth + 1} />}
          {info.supportsRoutines && <ObjectCategory connId={connId} ns={ns} kind="functions" depth={depth + 1} />}
          {info.supportsTriggers && <ObjectCategory connId={connId} ns={ns} kind="triggers" depth={depth + 1} />}
          {info.supportsEvents && <ObjectCategory connId={connId} ns={ns} kind="events" depth={depth + 1} />}
        </>
      )}
    </>
  )
}

function ConnectionNode({ id }: { id: string }) {
  const st = useApp()
  const cfg = st.connections.find((c) => c.id === id)!
  const sess = st.sessions[id]
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const { menu, open: ctxOpen } = useContextMenu()
  const { data: nss, err, reload } = useLoad<string[]>(!!sess && open, () => ctx(id).intro.namespaces(), [id, sess?.sessionId])
  const doConnect = async () => { setBusy(true); try { await st.connect(id) } catch (e) { st.toast('error', `${cfg.name}: ${(e as Error).message ?? e}`) } setBusy(false) }
  const visible = (nss ?? []).filter((n) => !ENGINES[cfg.engine].systemDatabases.includes(n))
  const sorted = [...visible, ...(nss ?? []).filter((n) => !visible.includes(n))]
  const preferred = cfg.database && sorted.includes(cfg.database) ? cfg.database : sorted[0]
  return (
    <>
      <Row depth={1} open={open} onToggle={() => setOpen(!open)} icon={sess ? <PlugZap size={13} className="text-ok" /> : <Plug size={13} className="text-muted" />}
        label={<span className="flex items-center gap-1.5">{cfg.name}<EnvBadge env={cfg.environment} /></span>}
        title={`${ENGINES[cfg.engine].label} · ${cfg.engine === 'sqlite' ? cfg.filePath : `${cfg.host}:${cfg.port}`} · ${ENVIRONMENTS[cfg.environment].label}`}
        right={busy ? '…' : sess ? 'connected' : ''} onClick={() => st.setActiveConn(id)}
        onDoubleClick={() => !sess && doConnect()}
        onContext={(e) => ctxOpen(e, [
          sess ? { label: 'Disconnect', onClick: () => st.disconnect(id) } : { label: 'Connect', onClick: doConnect },
          { label: 'New SQL query', onClick: () => { const t = st.newSqlTab(''); st.updateTab(t, { connId: id }) }, disabled: !sess },
          { label: 'Refresh', onClick: () => { reload(); void st.refreshSchema(id) }, disabled: !sess },
          { sep: true, label: '', onClick: () => {} },
          { label: 'Edit connection…', onClick: () => st.setDialog({ type: 'connection', editId: id }) },
          { label: 'Delete connection', danger: true, onClick: async () => { if (await st.confirm({ title: 'Delete connection', body: `Remove "${cfg.name}" and its saved password from the keychain?`, confirmLabel: 'Delete', danger: true })) void st.deleteConnection(id) } },
        ])} />
      {menu}
      {open && !sess && <div className="px-8 py-1"><button className="btn" onClick={doConnect} disabled={busy}><Plug size={12} />{busy ? 'Connecting…' : 'Connect'}</button></div>}
      {open && sess && err && <div className="px-8 py-1 text-[11px] text-danger">{err}</div>}
      {open && sess && !nss && !err && <div className="px-8 py-1 text-[11px] text-muted">Loading…</div>}
      {open && sess && sorted.map((n) => <Namespace key={n} connId={id} ns={n} depth={2} initiallyOpen={n === preferred} />)}
    </>
  )
}

export default function DbExplorer() {
  const { connections, sessions, setDialog, disconnect } = useApp()
  const groups = [...new Set(connections.map((c) => c.group || 'OTHER'))].sort()
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Database</span>
        <div className="flex gap-1">
          <button className="btn !px-1.5" title="New connection" aria-label="New connection" onClick={() => setDialog({ type: 'connection' })}><Plus size={13} /></button>
          <button className="btn !px-1.5" title="Disconnect all" aria-label="Disconnect all" disabled={!Object.keys(sessions).length} onClick={() => Object.keys(sessions).forEach((id) => disconnect(id))}><Unplug size={13} /></button>
        </div>
      </div>
      <div role="tree" className="min-h-0 flex-1 overflow-auto p-1">
        {groups.map((g) => (
          <div key={g} className="mb-1">
            <div className="px-2 py-1 text-[10px] font-semibold tracking-widest text-muted">{g}</div>
            {connections.filter((c) => (c.group || 'OTHER') === g).map((c) => <ConnectionNode key={c.id} id={c.id} />)}
          </div>
        ))}
        {!connections.length && (
          <Empty>
            <p className="mb-2">No connections yet.</p>
            <button className="btn btn-primary mx-auto" onClick={() => setDialog({ type: 'connection' })}><Plus size={13} />Connect database</button>
          </Empty>
        )}
      </div>
      <div className="flex items-center gap-1 border-t border-line px-3 py-1.5 text-[10px] text-muted"><RefreshCw size={10} />Schema loads lazily; double-click a table to open its data.</div>
    </div>
  )
}

export { designFromDetails }
