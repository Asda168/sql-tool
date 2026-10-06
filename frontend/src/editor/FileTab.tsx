import { useApp, type Tab } from '../store/app'
import CodeEditor, { languageFor } from './CodeEditor'

export default function FileTab({ tab }: { tab: Extract<Tab, { kind: 'file' }> }) {
  const { updateTab, saveTab, settings, projectPath } = useApp()
  const crumbs = (projectPath && tab.filePath.startsWith(projectPath) ? tab.filePath.slice(projectPath.length) : tab.filePath).split(/[\\/]/).filter(Boolean)
  return (
    <div className="flex h-full flex-col" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void saveTab(tab.id) } }}>
      {settings.breadcrumbs && <div className="shrink-0 truncate border-b border-line px-3 py-1 text-xs text-muted">{crumbs.join('  ›  ')}</div>}
      <div className="min-h-0 flex-1">
        <CodeEditor path={`tab-${tab.id}/${tab.title}`} language={languageFor(tab.title)} value={tab.content}
          onChange={(v) => { updateTab(tab.id, { content: v, dirty: true }) }} />
      </div>
    </div>
  )
}
