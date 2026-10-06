import { uid, useApp } from '../store/app'
import type { MenuItem } from '../components/ui'
import { ctx, dropSql, duplicateSql, generateSql, renameSql, runDdl } from './actions'

export interface TableLike { name: string; kind: 'table' | 'view'; comment?: string }

export const openTableData = (connId: string, ns: string, table: string) =>
  useApp.getState().openTab({ id: `tbl:${connId}:${ns}:${table}`, kind: 'table', title: table, connId, ns, table })

/** Right-click menu for a table or view. Built on demand, reads the store only when an item is clicked. */
export function tableMenuItems(connId: string, ns: string, t: TableLike, changed: () => void): MenuItem[] {
  const st = () => useApp.getState()
  const sqlTab = async (kind: Parameters<typeof generateSql>[3]) => {
    try { const id = st().newSqlTab(await generateSql(connId, ns, t.name, kind), `${t.name}.${kind}.sql`); st().updateTab(id, { connId }) } catch (e) { st().toast('error', (e as Error).message) }
  }
  const guard = async (fn: () => Promise<unknown>) => { try { await fn() } catch (e) { st().toast('error', (e as Error).message ?? String(e)) } }
  const engine = () => ctx(connId).engine
  const sep: MenuItem = { sep: true, label: '', onClick: () => {} }
  return [
    { label: 'Open Table', onClick: () => openTableData(connId, ns, t.name) },
    { label: 'Edit Table', disabled: t.kind === 'view', onClick: () => st().openTab({ id: `dsg:${connId}:${ns}:${t.name}`, kind: 'designer', title: `Edit ${t.name}`, connId, ns, table: t.name }) },
    { label: 'Create Table', onClick: () => st().openTab({ id: `dsg:${connId}:${ns}:new:${uid()}`, kind: 'designer', title: 'New table', connId, ns }) },
    sep,
    { label: 'Rename…', disabled: t.kind === 'view', onClick: () => guard(async () => { const n = await st().prompt({ title: 'Rename table', label: 'New name', initial: t.name, confirmLabel: 'Rename' }); if (n && n !== t.name && await runDdl(connId, [renameSql(engine(), ns, t.name, n)], `Rename "${t.name}" to "${n}"`, false)) changed() }) },
    { label: 'Duplicate…', disabled: t.kind === 'view', onClick: () => guard(async () => { const n = await st().prompt({ title: 'Duplicate table', label: 'Name of the copy', initial: `${t.name}_copy`, confirmLabel: 'Duplicate' }); if (n && await runDdl(connId, duplicateSql(engine(), ns, t.name, n), `Copy "${t.name}" (structure and data) to "${n}"`, false)) changed() }) },
    { label: 'Delete…', danger: true, onClick: () => guard(async () => { if (await runDdl(connId, [dropSql(engine(), ns, t.name, t.kind === 'view')], `Permanently delete ${t.kind} "${t.name}"`)) changed() }) },
    sep,
    { label: 'Generate SQL: SELECT', onClick: () => sqlTab('select') }, { label: 'Generate SQL: INSERT', onClick: () => sqlTab('insert') },
    { label: 'Generate SQL: UPDATE', onClick: () => sqlTab('update') }, { label: 'Generate SQL: DELETE', onClick: () => sqlTab('delete') },
    { label: 'Generate SQL: CREATE TABLE', onClick: () => sqlTab('create') },
    sep,
    { label: 'Copy table name', onClick: () => void navigator.clipboard?.writeText(t.name) },
  ]
}
