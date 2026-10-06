import { Database, Plus, Settings, SquareTerminal, type LucideIcon } from 'lucide-react'
import { useApp, type LeftPanel } from '../store/app'
import { toggleTerminal } from '../terminal/termStore'
import { mod } from '../lib/os'

/** Narrow 48px application sidebar: subtle line icons with a small cyan indicator on the active view. */
export default function ActivityBar() {
  const st = useApp()
  const Btn = ({ icon: Icon, label, active, onClick, hint }: { icon: LucideIcon; label: string; active?: boolean; onClick: () => void; hint?: string }) => (
    <button title={hint ? `${label} (${hint})` : label} aria-label={label} aria-pressed={active} onClick={onClick}
      className={`relative flex h-10 w-full items-center justify-center ${active ? 'text-fg' : 'text-muted hover:text-fg'}`}>
      {active && <span className="absolute left-0 top-2 h-6 w-[2px] rounded-r bg-accent" aria-hidden />}
      <Icon size={18} strokeWidth={1.75} />
    </button>
  )
  const panel = (p: LeftPanel) => st.showLeft && st.leftPanel === p
  return (
    <nav aria-label="Views" className="flex w-12 shrink-0 flex-col items-center border-r border-line bg-panel py-1">
      <Btn icon={Database} label="Database" active={panel('database')} hint={`${mod()}+Shift+D`} onClick={() => { st.setLeftPanel('database'); if (st.leftPanel === 'database') useApp.setState({ connList: true }) }} />
      <Btn icon={Plus} label="New Connection" onClick={() => st.setDialog({ type: 'connection' })} />
      <Btn icon={SquareTerminal} label="Terminal" active={st.showTerminal} hint={`${mod()}+\``} onClick={toggleTerminal} />
      <div className="flex-1" />
      <Btn icon={Settings} label="Settings" active={st.tabs.find((t) => t.id === st.activeTabId)?.kind === 'settings'} onClick={() => st.openTab({ id: 'settings', kind: 'settings', title: 'Settings' })} />
    </nav>
  )
}
