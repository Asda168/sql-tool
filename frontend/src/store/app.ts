import { create } from 'zustand'
import { bridge, type ConnectionConfig, type ProjectInfo, type QueryResult } from '../bridge'
import { ENGINES, type EngineId } from '../lib/engines'
import { Introspector, type SchemaInfo } from '../lib/introspect'
import { analyse, isWrite, statementAt } from '../lib/sqlSafety'
import { noteUsage } from '../lib/usage'

// ---------- settings ----------
export interface Settings {
  fontFamily: string; fontSize: number; fontWeight: number; lineHeight: number; letterSpacing: number
  ligatures: boolean; wordWrap: boolean; minimap: boolean; breadcrumbs: boolean; folding: boolean
  cursorStyle: 'line' | 'block' | 'underline'; tabSize: number; autoSave: boolean
  theme: 'dark' | 'light' | 'system'
  terminalShell: string; terminalFontSize: number
  gitAutoFetch: boolean; confirmDestructive: boolean; rowLimit: number; queryTimeoutSec: number
}
export const DEFAULT_SETTINGS: Settings = {
  fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0,
  ligatures: true, wordWrap: false, minimap: true, breadcrumbs: true, folding: true,
  cursorStyle: 'line', tabSize: 4, autoSave: false, theme: 'dark',
  terminalShell: 'default', terminalFontSize: 13, gitAutoFetch: false, confirmDestructive: true, rowLimit: 1000, queryTimeoutSec: 30,
}

// ---------- tabs ----------
export type Tab =
  | { id: string; kind: 'sql'; title: string; content: string; filePath?: string; dirty: boolean; connId?: string; pinned?: boolean }
  | { id: string; kind: 'file'; title: string; content: string; filePath: string; dirty: boolean; pinned?: boolean }
  | { id: string; kind: 'table'; title: string; connId: string; ns: string; table: string; pinned?: boolean }
  | { id: string; kind: 'designer'; title: string; connId: string; ns: string; table?: string; pinned?: boolean }
  | { id: string; kind: 'erd'; title: string; connId: string; ns: string; pinned?: boolean }
  | { id: string; kind: 'settings'; title: string; pinned?: boolean }
  | { id: string; kind: 'welcome'; title: string; pinned?: boolean }

export interface Session { sessionId: string; engine: EngineId; version?: string }
export interface HistoryItem { id: string; sql: string; at: string; connId: string; connName: string; database: string; ms: number; status: 'success' | 'error' | 'cancelled'; error?: string }
export interface SavedQuery { id: string; title: string; sql: string }
export interface Toast { id: number; kind: 'info' | 'error' | 'success'; text: string }
export interface TabResult { running: boolean; result?: QueryResult; error?: string; sql?: string; ranAt?: string; connId?: string; verdicts?: string }

export type Dialog =
  | { type: 'confirm'; title: string; body: string; detail?: string[]; confirmLabel: string; danger: boolean; banner?: string; resolve: (ok: boolean) => void }
  | { type: 'prompt'; title: string; label: string; placeholder?: string; initial?: string; confirmLabel: string; resolve: (v: string | null) => void }
  | { type: 'connection'; editId?: string; engine?: EngineId; initial?: Partial<ConnectionConfig> }
  | { type: 'clone' }
  | { type: 'about' }
  | { type: 'palette'; mode: 'commands' | 'files' | 'tables' }
  | { type: 'save-query'; sql: string }

const load = <T,>(k: string, d: T): T => {
  try { const v = localStorage.getItem('forge.' + k); return v ? { ...(Array.isArray(d) ? [] : (d as object)), ...JSON.parse(v) } as T : d } catch { return d }
}
const loadArr = <T,>(k: string): T[] => {
  try { const v = localStorage.getItem('forge.' + k); return v ? (JSON.parse(v) as T[]) : [] } catch { return [] }
}
const save = (k: string, v: unknown) => { try { localStorage.setItem('forge.' + k, JSON.stringify(v)) } catch { /* storage unavailable */ } }
export const uid = () => Math.random().toString(36).slice(2, 10)

export interface Layout { sidebar: 'left' | 'right'; terminal: 'bottom' | 'right'; results: 'bottom' | 'right' }
export const DEFAULT_LAYOUT: Layout = { sidebar: 'left', terminal: 'bottom', results: 'bottom' }

export type LeftPanel = 'database' | 'projects' | 'git' | 'search' | 'history'

interface State {
  settings: Settings
  setSettings: (p: Partial<Settings>) => void
  resolvedTheme: 'dark' | 'light'

  connections: ConnectionConfig[]
  sessions: Record<string, Session>
  schemaCache: Record<string, Record<string, SchemaInfo>> // connId -> database/schema -> tables, columns, foreign keys (autocomplete + search)
  namespaces: Record<string, string[]> // connId -> database/schema names
  loadNs: (connId: string, ns: string, force?: boolean) => Promise<SchemaInfo | undefined>
  selectDatabase: (connId: string, ns: string, forceTab?: boolean) => Promise<void>
  activeConnId?: string
  saveConnection: (c: ConnectionConfig, password?: string) => Promise<void>
  deleteConnection: (id: string) => Promise<void>
  connect: (id: string, password?: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
  refreshSchema: (id: string, ns?: string) => Promise<void>
  setActiveConn: (id?: string) => void

  projectPath?: string
  projectInfo?: ProjectInfo
  recentProjects: string[]
  openProject: (path: string) => Promise<void>
  fsVersion: number
  bumpFs: () => void

  tabs: Tab[]
  activeTabId?: string
  splitTabId?: string
  splitDir: 'right' | 'down'
  results: Record<string, TabResult>
  openTab: (t: Tab) => void
  newSqlTab: (content?: string, title?: string) => string
  openFile: (path: string) => Promise<void>
  closeTab: (id: string) => void
  closeOthers: (id: string) => void
  closeAll: () => void
  togglePin: (id: string) => void
  duplicateTab: (id: string) => void
  splitTab: (id: string, dir: 'right' | 'down') => void
  closeSplit: () => void
  setActive: (id: string) => void
  updateTab: (id: string, p: Partial<Tab>) => void
  saveTab: (id: string) => Promise<void>

  history: HistoryItem[]
  saved: SavedQuery[]
  clearHistory: () => void
  deleteHistory: (id: string) => void
  deleteSaved: (id: string) => void
  addSaved: (title: string, sql: string) => void
  runSql: (tabId: string, mode: 'all' | 'selection' | 'statement', selection?: { text: string; offset: number }) => Promise<void>
  cancelQuery: (tabId: string) => Promise<void>

  leftPanel: LeftPanel
  showLeft: boolean
  showRight: boolean
  showTerminal: boolean
  terminalMax: boolean
  setLeftPanel: (p: LeftPanel) => void
  toggle: (k: 'showLeft' | 'showRight' | 'showTerminal' | 'terminalMax' | 'showResults') => void

  toasts: Toast[]
  toast: (kind: Toast['kind'], text: string) => void
  dialog: Dialog | null
  setDialog: (d: Dialog | null) => void
  confirm: (o: { title: string; body: string; detail?: string[]; confirmLabel?: string; danger?: boolean; banner?: string }) => Promise<boolean>
  prompt: (o: { title: string; label: string; placeholder?: string; initial?: string; confirmLabel?: string }) => Promise<string | null>
  firstRunDone: boolean
  finishFirstRun: () => void
  gitVersion: number
  bumpGit: () => void
  lastUsed: Record<string, string>
  showResults: boolean
  connList: boolean
  settingsCat: string
  setConnList: (b: boolean) => void
  layout: Layout
  setLayout: (p: Partial<Layout>) => void
  focusMode: boolean
  toggleFocusMode: () => void
  selectedNs: Record<string, string>
  setNs: (connId: string, ns: string) => void
  switchConnection: (id: string) => Promise<void>
  selectedEntry?: { path: string; name: string; isDir: boolean }
}

const sysDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
const resolve = (t: Settings['theme']) => (t === 'system' ? (sysDark() ? 'dark' : 'light') : t)

let toastSeq = 0
let focusBackup = { showLeft: true, showTerminal: false }
const connecting = new Set<string>() // guards against two simultaneous connects (e.g. auto-connect + a click)
const running = new Map<string, string>() // tabId -> sessionId, for cancel

export const useApp = create<State>((set, get) => ({
  settings: load('settings', DEFAULT_SETTINGS),
  resolvedTheme: resolve(load('settings', DEFAULT_SETTINGS).theme),
  setSettings: (p) => {
    const settings = { ...get().settings, ...p }
    save('settings', settings)
    set({ settings, resolvedTheme: resolve(settings.theme) })
  },

  connections: loadArr<ConnectionConfig>('connections'),
  sessions: {},
  schemaCache: {},
  namespaces: {},
  activeConnId: undefined,
  setActiveConn: (id) => set({ activeConnId: id }),

  saveConnection: async (c, password) => {
    // Secrets go to the OS keychain only; the persisted record never contains the password.
    if (password) await bridge().secrets.save(`conn:${c.id}`, password)
    const { password: _drop, ...clean } = c
    void _drop
    const list = get().connections.filter((x) => x.id !== c.id).concat(clean as ConnectionConfig)
    save('connections', list)
    set({ connections: list })
  },
  deleteConnection: async (id) => {
    await get().disconnect(id)
    await bridge().secrets.remove(`conn:${id}`).catch(() => {})
    const list = get().connections.filter((c) => c.id !== id)
    save('connections', list)
    set({ connections: list, activeConnId: get().activeConnId === id ? undefined : get().activeConnId })
  },
  connect: async (id, password) => {
    const cfg = get().connections.find((c) => c.id === id)
    if (!cfg || get().sessions[id] || connecting.has(id)) return
    connecting.add(id)
    try {
    const pw = password ?? (await bridge().secrets.get(`conn:${id}`)) ?? ''
    const sessionId = await bridge().db.connect({ ...cfg, password: pw })
    // The demo bridge runs SQLite regardless of the saved engine, so introspection must speak SQLite.
    const engine: EngineId = bridge().kind === 'demo' ? 'sqlite' : cfg.engine
    const lastUsed = { ...get().lastUsed, [id]: new Date().toISOString() }
    save('lastUsed', lastUsed)
    set((s) => ({ sessions: { ...s.sessions, [id]: { sessionId, engine } }, activeConnId: id, lastUsed, connList: false, leftPanel: 'database', showLeft: true }))
    get().toast('success', `Connected to ${cfg.name}`)
    void get().refreshSchema(id)
    } finally { connecting.delete(id) }
  },
  disconnect: async (id) => {
    const s = get().sessions[id]
    if (!s) return
    await bridge().db.disconnect(s.sessionId).catch(() => {})
    set((st) => {
      const sessions = { ...st.sessions }
      delete sessions[id]
      return { sessions }
    })
  },
  /** Reload names + the active database's schema in the background (metadata only, no row data). */
  refreshSchema: async (id, ns) => {
    const s = get().sessions[id]
    const cfg = get().connections.find((c) => c.id === id)
    if (!s || !cfg) return
    try {
      const intro = new Introspector(bridge(), s.sessionId, s.engine)
      const all = await intro.namespaces()
      set((st) => ({ namespaces: { ...st.namespaces, [id]: all } }))
      const user = all.filter((n) => !ENGINES[s.engine].systemDatabases.includes(n))
      const target = ns ?? get().selectedNs[id] ?? (s.engine === 'sqlite' ? 'main' : cfg.database || (user.length === 1 ? user[0] : ''))
      if (target) {
        if (!get().selectedNs[id]) get().setNs(id, target) // a single/default database is selected automatically
        await get().loadNs(id, target, true)
      }
    } catch { /* autocomplete simply stays empty */ }
  },
  loadNs: async (id, ns, force = false) => {
    const s = get().sessions[id]
    if (!s) return undefined
    const have = get().schemaCache[id]?.[ns]
    if (have && !force) return have
    try {
      const info = await new Introspector(bridge(), s.sessionId, s.engine).fullSchema(ns)
      set((st) => ({ schemaCache: { ...st.schemaCache, [id]: { ...st.schemaCache[id], [ns]: info } } }))
      return info
    } catch { return undefined }
  },
  /** Make a database the active one: queries run in it, autocomplete and search use it, and a query tab is ready to type in. */
  selectDatabase: async (id, ns, forceTab = true) => {
    get().setNs(id, ns)
    set({ activeConnId: id })
    void get().loadNs(id, ns)
    const active = get().tabs.find((t) => t.id === get().activeTabId)
    if (active?.kind === 'sql') { get().updateTab(active.id, { connId: id }); return }
    // not in a query tab: open one (always when asked, otherwise only if there is no query tab at all)
    if (forceTab || !get().tabs.some((t) => t.kind === 'sql')) {
      const tab = get().newSqlTab('', 'query.sql')
      get().updateTab(tab, { connId: id })
      get().toast('info', `Using ${ns}. Start typing SQL.`)
    }
  },

  projectPath: undefined,
  projectInfo: undefined,
  recentProjects: loadArr<string>('recent'),
  openProject: async (path) => {
    const info = await bridge().fs.detectProject(path)
    const recent = [path, ...get().recentProjects.filter((p) => p !== path)].slice(0, 8)
    save('recent', recent)
    set({ projectPath: path, projectInfo: info, recentProjects: recent, showLeft: true, leftPanel: 'projects', fsVersion: get().fsVersion + 1 })
    get().toast('success', `Opened ${path.split(/[\\/]/).pop()} (${info.label})`)
  },
  fsVersion: 0,
  bumpFs: () => set((s) => ({ fsVersion: s.fsVersion + 1 })),

  tabs: [],
  activeTabId: undefined,
  splitTabId: undefined,
  splitDir: 'right',
  results: {},
  openTab: (t) => {
    const existing = get().tabs.find((x) => x.id === t.id)
    if (existing) return set({ activeTabId: t.id })
    // welcome tab disappears once real work starts
    const tabs = get().tabs.filter((x) => x.kind !== 'welcome' || t.kind === 'welcome')
    set({ tabs: [...tabs, t], activeTabId: t.id })
  },
  newSqlTab: (content = '', title) => {
    const n = get().tabs.filter((t) => t.kind === 'sql').length + 1
    const id = uid()
    get().openTab({ id, kind: 'sql', title: title ?? `query-${n}.sql`, content, dirty: false, connId: get().activeConnId })
    return id
  },
  openFile: async (path) => {
    const existing = get().tabs.find((t) => (t.kind === 'file' || t.kind === 'sql') && t.filePath === path)
    if (existing) return set({ activeTabId: existing.id })
    try {
      const content = await bridge().fs.read(path)
      const title = path.split(/[\\/]/).pop() ?? path
      if (/\.sql$/i.test(path)) get().openTab({ id: uid(), kind: 'sql', title, content, filePath: path, dirty: false, connId: get().activeConnId })
      else get().openTab({ id: uid(), kind: 'file', title, content, filePath: path, dirty: false })
    } catch (e) { get().toast('error', `Cannot open file: ${(e as Error).message ?? e}`) }
  },
  closeTab: (id) => {
    const { tabs, activeTabId, splitTabId } = get()
    const i = tabs.findIndex((t) => t.id === id)
    if (i < 0) return
    const next = tabs.filter((t) => t.id !== id)
    const res = { ...get().results }
    delete res[id]
    set({
      tabs: next, results: res,
      splitTabId: splitTabId === id ? undefined : splitTabId,
      activeTabId: activeTabId === id ? (next[Math.min(i, next.length - 1)]?.id) : activeTabId,
    })
  },
  closeOthers: (id) => set((s) => ({ tabs: s.tabs.filter((t) => t.id === id || t.pinned), activeTabId: id, splitTabId: undefined })),
  closeAll: () => set((s) => { const tabs = s.tabs.filter((t) => t.pinned); return { tabs, activeTabId: tabs[0]?.id, splitTabId: undefined } }),
  togglePin: (id) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)) })),
  duplicateTab: (id) => {
    const t = get().tabs.find((x) => x.id === id)
    if (!t) return
    const copy = { ...t, id: uid(), title: t.title.replace(/(\.\w+)?$/, ' copy$1'), pinned: false } as Tab
    if ('filePath' in copy) delete (copy as { filePath?: string }).filePath
    get().openTab(copy)
  },
  splitTab: (id, dir) => set({ splitTabId: id, splitDir: dir }),
  closeSplit: () => set({ splitTabId: undefined }),
  setActive: (id) => set({ activeTabId: id }),
  updateTab: (id, p) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? ({ ...t, ...p } as Tab) : t)) })),
  saveTab: async (id) => {
    const t = get().tabs.find((x) => x.id === id)
    if (!t || (t.kind !== 'sql' && t.kind !== 'file')) return
    try {
      if (t.filePath) {
        await bridge().fs.write(t.filePath, t.content)
      } else {
        const ok = await bridge().fs.saveDialog(t.title, t.content)
        if (!ok) return
      }
      get().updateTab(id, { dirty: false })
      get().bumpGit()
      get().toast('success', `Saved ${t.title}`)
    } catch (e) { get().toast('error', `Save failed: ${(e as Error).message ?? e}`) }
  },

  history: loadArr<HistoryItem>('history'),
  saved: loadArr<SavedQuery>('saved'),
  clearHistory: () => { save('history', []); set({ history: [] }) },
  deleteHistory: (id) => { const h = get().history.filter((x) => x.id !== id); save('history', h); set({ history: h }) },
  deleteSaved: (id) => { const s = get().saved.filter((x) => x.id !== id); save('saved', s); set({ saved: s }) },
  addSaved: (title, sql) => { const s = [{ id: uid(), title, sql }, ...get().saved]; save('saved', s); set({ saved: s }) },

  runSql: async (tabId, mode, selection) => {
    const st = get()
    const tab = st.tabs.find((t) => t.id === tabId)
    if (!tab || tab.kind !== 'sql') return
    const connId = tab.connId ?? st.activeConnId
    const sess = connId ? st.sessions[connId] : undefined
    const cfg = st.connections.find((c) => c.id === connId)
    const setRes = (r: Partial<TabResult>) => set((s) => ({ results: { ...s.results, [tabId]: { ...s.results[tabId], running: false, ...r } } }))
    if (!connId || !sess || !cfg) return setRes({ error: 'Not connected. Choose a connection in the toolbar or connect one from the Database panel.' })

    let sql = tab.content
    if (mode === 'selection' && selection?.text.trim()) sql = selection.text
    else if (mode === 'statement' && selection) sql = statementAt(tab.content, selection.offset)
    if (!sql.trim()) return setRes({ error: 'Nothing to run.' })

    // Safety gate: parse first, never execute automatically, always confirm destructive/production writes.
    const a = analyse(sql)
    const prod = cfg.environment === 'production'
    const writes = a.statements.filter((s) => isWrite(s.kind))
    if (st.settings.confirmDestructive && (a.requiresConfirmation || (prod && writes.length))) {
      const ok = await get().confirm({
        title: 'Potentially destructive operation',
        body: prod ? `You are about to run a modifying statement on the PRODUCTION database "${cfg.name}".` : 'This query may modify or remove data.',
        detail: [...a.statements.filter((s) => s.destructive).flatMap((s) => s.reasons), ...(prod && !a.requiresConfirmation ? writes.map((w) => `${w.kind} statement will change production data.`) : [])],
        confirmLabel: 'Execute', danger: true, banner: prod ? 'PRODUCTION DATABASE' : undefined,
      })
      if (!ok) return
    }

    set((s) => ({ results: { ...s.results, [tabId]: { running: true, sql, connId } } }))
    running.set(tabId, sess.sessionId)
    const t0 = Date.now()
    const record = (status: HistoryItem['status'], ms: number, error?: string) => {
      const item: HistoryItem = { id: uid(), sql, at: new Date().toISOString(), connId, connName: cfg.name, database: cfg.database || cfg.filePath, ms, status, error }
      const h = [item, ...get().history].slice(0, 500)
      save('history', h)
      set({ history: h })
    }
    try {
      // Run statements one at a time (stop at the first error); the last statement's result is shown.
      const parts = a.statements.length ? a.statements.map((x) => x.statement) : [sql]
      let result: QueryResult = { columns: [], rows: [], affected: 0, elapsedMs: 0, truncated: false }
      let totalMs = 0
      let totalAffected = 0
      for (const part of parts) {
        result = await bridge().db.query(sess.sessionId, part, { maxRows: st.settings.rowLimit, database: get().selectedNs[connId] })
        totalMs += result.elapsedMs
        totalAffected += result.affected
      }
      if (parts.length > 1) result = { ...result, elapsedMs: totalMs, affected: result.columns.length ? result.affected : totalAffected }
      setRes({ result, error: undefined, sql, ranAt: new Date().toISOString(), connId })
      record('success', result.elapsedMs || Date.now() - t0)
      { const known = new Set(Object.values(get().schemaCache[connId] ?? {}).flatMap((i) => Object.keys(i.tables).map((t) => t.toLowerCase()))); noteUsage(connId, sql, (w) => known.has(w.toLowerCase())) }
      if (a.statements.some((s) => ['CREATE', 'DROP', 'ALTER'].includes(s.kind))) void get().refreshSchema(connId)
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      const cancelled = /cancel|interrupt/i.test(msg)
      setRes({ error: msg, result: undefined, sql })
      record(cancelled ? 'cancelled' : 'error', Date.now() - t0, msg)
    } finally {
      running.delete(tabId)
    }
  },
  cancelQuery: async (tabId) => {
    const sid = running.get(tabId)
    if (sid) await bridge().db.cancel(sid).catch(() => {})
  },

  leftPanel: 'database',
  showLeft: true,
  showRight: true,
  showTerminal: false,
  terminalMax: false,
  setLeftPanel: (p) => set((s) => ({ leftPanel: p, showLeft: s.leftPanel === p ? !s.showLeft : true })),
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<State>),

  toasts: [],
  toast: (kind, text) => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-4) }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 3500)
  },
  dialog: null,
  setDialog: (d) => set({ dialog: d }),
  confirm: (o) => new Promise((resolve) => set({ dialog: { type: 'confirm', confirmLabel: 'Confirm', danger: false, ...o, resolve: (ok) => { set({ dialog: null }); resolve(ok) } } })),
  prompt: (o) => new Promise((resolve) => set({ dialog: { type: 'prompt', confirmLabel: 'Create', ...o, resolve: (v) => { set({ dialog: null }); resolve(v) } } })),
  firstRunDone: (() => { try { return localStorage.getItem('forge.firstRun') === '1' } catch { return false } })(),
  finishFirstRun: () => { try { localStorage.setItem('forge.firstRun', '1') } catch { /* ignore */ } set({ firstRunDone: true }) },
  gitVersion: 0,
  bumpGit: () => set((s) => ({ gitVersion: s.gitVersion + 1 })),
  lastUsed: load<Record<string, string>>('lastUsed', {}),
  showResults: true,
  connList: false,
  settingsCat: 'Editor',
  setConnList: (b) => set({ connList: b }),
  layout: load<Layout>('layout', DEFAULT_LAYOUT),
  setLayout: (patch) => { const layout = { ...get().layout, ...patch }; save('layout', layout); set({ layout }) },
  focusMode: false,
  /** Hide the sidebar and terminal for a distraction-free editor; toggling again restores them. */
  toggleFocusMode: () => {
    if (get().focusMode) { set({ focusMode: false, showLeft: focusBackup.showLeft, showTerminal: focusBackup.showTerminal }); return }
    focusBackup = { showLeft: get().showLeft, showTerminal: get().showTerminal }
    set({ focusMode: true, showLeft: false, showTerminal: false, terminalMax: false })
  },
  selectedNs: load<Record<string, string>>('selectedNs', {}),
  setNs: (connId, ns) => { const selectedNs = { ...get().selectedNs, [connId]: ns }; save('selectedNs', selectedNs); set({ selectedNs }) },
  /** Footer switcher: make a saved connection the active one (connecting it if needed) and point the current SQL tab at it. */
  switchConnection: async (id) => {
    if (!get().sessions[id]) await get().connect(id)
    if (!get().sessions[id]) return
    const tab = get().tabs.find((t) => t.id === get().activeTabId)
    set({ activeConnId: id, connList: false })
    if (tab && tab.kind === 'sql') get().updateTab(tab.id, { connId: id })
  },
}))
