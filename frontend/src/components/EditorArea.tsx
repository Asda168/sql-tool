import { Suspense, lazy } from 'react'
import { Database, FileText, Network, Settings as Cog, Table2, Pin, X, Home, Wrench } from 'lucide-react'
import { useApp, type Tab } from '../store/app'
import { useContextMenu } from './ui'
import Welcome from './Welcome'

const SqlTab = lazy(() => import('../editor/SqlTab'))
const FileTab = lazy(() => import('../editor/FileTab'))
const TableDataTab = lazy(() => import('../database/TableDataTab'))
const TableDesignerTab = lazy(() => import('../database/TableDesignerTab'))
const ErdTab = lazy(() => import('../database/ErdTab'))
const SettingsTab = lazy(() => import('../settings/SettingsTab'))

const icon = (t: Tab) => ({ sql: <Database size={12} className="text-accent" />, file: <FileText size={12} />, table: <Table2 size={12} className="text-accent" />, designer: <Wrench size={12} />, erd: <Network size={12} />, settings: <Cog size={12} />, welcome: <Home size={12} /> })[t.kind]

export function TabContent({ tab }: { tab: Tab }) {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-muted">Loading editor…</div>}>
      {tab.kind === 'sql' && <SqlTab tab={tab} />}
      {tab.kind === 'file' && <FileTab tab={tab} />}
      {tab.kind === 'table' && <TableDataTab tab={tab} />}
      {tab.kind === 'designer' && <TableDesignerTab tab={tab} />}
      {tab.kind === 'erd' && <ErdTab tab={tab} />}
      {tab.kind === 'settings' && <SettingsTab />}
      {tab.kind === 'welcome' && <Welcome />}
    </Suspense>
  )
}

function TabBar() {
  const st = useApp()
  const { menu, open } = useContextMenu()
  const close = async (t: Tab) => {
    if ((t.kind === 'sql' || t.kind === 'file') && t.dirty && !(await st.confirm({ title: 'Unsaved changes', body: `"${t.title}" has unsaved changes. Close anyway?`, confirmLabel: 'Close without saving', danger: true }))) return
    st.closeTab(t.id)
  }
  const sorted = [...st.tabs].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
  return (
    <div role="tablist" className="flex shrink-0 overflow-x-auto border-b border-line bg-panel">
      {sorted.map((t) => (
        <div key={t.id} role="tab" aria-selected={t.id === st.activeTabId} tabIndex={0} onClick={() => st.setActive(t.id)} onAuxClick={(e) => e.button === 1 && close(t)}
          onKeyDown={(e) => e.key === 'Enter' && st.setActive(t.id)}
          onContextMenu={(e) => open(e, [
            { label: 'Close', onClick: () => close(t) }, { label: 'Close Others', onClick: () => st.closeOthers(t.id) }, { label: 'Close All', onClick: () => st.closeAll() },
            { sep: true, label: '', onClick: () => {} },
            { label: t.pinned ? 'Unpin' : 'Pin', onClick: () => st.togglePin(t.id) }, { label: 'Duplicate', onClick: () => st.duplicateTab(t.id) },
            { label: 'Split Right', onClick: () => st.splitTab(t.id, 'right') }, { label: 'Split Down', onClick: () => st.splitTab(t.id, 'down') },
          ])}
          className={`group flex max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-line px-3 py-1.5 text-xs ${t.id === st.activeTabId ? 'border-t-2 border-t-accent bg-bg' : 'border-t-2 border-t-transparent text-muted hover:text-fg'}`}>
          {icon(t)}
          <span className="truncate">{t.title}</span>
          {(t.kind === 'sql' || t.kind === 'file') && t.dirty && <span className="text-warn" title="Unsaved" aria-label="unsaved">●</span>}
          {t.pinned ? <Pin size={11} className="text-accent" aria-label="Pinned" /> : <button aria-label={`Close ${t.title}`} className="opacity-0 hover:text-danger group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); void close(t) }}><X size={12} /></button>}
        </div>
      ))}
      {menu}
    </div>
  )
}

export default function EditorArea() {
  const st = useApp()
  const active = st.tabs.find((t) => t.id === st.activeTabId)
  const split = st.tabs.find((t) => t.id === st.splitTabId)
  return (
    <div className="flex h-full min-w-0 flex-col">
      <TabBar />
      <div className={`flex min-h-0 flex-1 ${st.splitDir === 'down' ? 'flex-col' : 'flex-row'}`}>
        <div className="min-h-0 min-w-0 flex-1">{active ? <TabContent key={active.id} tab={active} /> : <Welcome />}</div>
        {split && split.id !== active?.id && (
          <div className={`relative min-h-0 min-w-0 flex-1 ${st.splitDir === 'down' ? 'border-t' : 'border-l'} border-line`}>
            <button className="btn absolute right-2 top-1 z-10 !px-1.5" aria-label="Close split" onClick={st.closeSplit}><X size={12} /></button>
            <TabContent key={split.id} tab={split} />
          </div>
        )}
      </div>
    </div>
  )
}
