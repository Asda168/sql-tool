import { create } from 'zustand'
import { useApp } from '../store/app'

export interface TermItem { key: string; title: string; cwd: string; shell: string }
interface TermState {
  items: TermItem[]
  activeKey?: string
  split: boolean
  counter: number
  add: (cwd?: string, shell?: string) => void
  remove: (key: string) => void
  setActive: (k: string) => void
  toggleSplit: () => void
}

export const useTerms = create<TermState>((set, get) => ({
  items: [], activeKey: undefined, split: false, counter: 0,
  add: (cwd, shell) => {
    const app = useApp.getState()
    const n = get().counter + 1
    const key = `term-${n}`
    const item: TermItem = { key, title: `Terminal ${n}`, cwd: cwd ?? app.projectPath ?? '', shell: shell ?? app.settings.terminalShell }
    set({ items: [...get().items, item], activeKey: key, counter: n })
    useApp.setState({ showTerminal: true })
  },
  remove: (key) => {
    const items = get().items.filter((i) => i.key !== key)
    set({ items, activeKey: get().activeKey === key ? items[items.length - 1]?.key : get().activeKey })
  },
  setActive: (activeKey) => set({ activeKey }),
  toggleSplit: () => set((s) => ({ split: !s.split })),
}))

/** Open a terminal rooted at `cwd` (used by "Open Terminal Here"). */
export const openTerminalHere = (cwd?: string) => useTerms.getState().add(cwd)

/** terminal key -> backend shell id, filled once the shell has spawned. */
export const termIds = new Map<string, string>()

/** Run a command in the active terminal (opening one if needed). The user sees it execute; nothing runs silently. */
export async function runInTerminal(cmd: string) {
  const t = useTerms.getState()
  if (!t.items.length || !t.activeKey) t.add()
  useApp.setState({ showTerminal: true })
  for (let i = 0; i < 40; i++) {
    const key = useTerms.getState().activeKey
    const id = key ? termIds.get(key) : undefined
    if (id) return void (await import('../bridge')).bridge().term.write(id, cmd + String.fromCharCode(13))
    await new Promise((r) => setTimeout(r, 100))
  }
}
