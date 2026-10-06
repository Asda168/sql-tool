import { useEffect, useMemo, useRef, useState } from 'react'
import { bridge } from '../bridge'
import { mod } from '../lib/os'
import { useApp } from '../store/app'
import { useTerms } from '../terminal/termStore'
import { Modal } from './ui'
import { formatSql } from '../lib/format'
import { fuzzyScore } from '../lib/sqlContext'
import { joinPath } from './FileExplorer'

interface Cmd { id: string; label: string; hint?: string; run: () => void | Promise<void> }

export function useCommands(): Cmd[] {
  const st = useApp.getState
  const git = (op: 'pull' | 'push', label: string): Cmd => ({ id: `git-${op}`, label, run: async () => { const s = st(); if (!s.projectPath) return s.toast('error', 'Open a project first'); try { s.toast('success', (await bridge().git.run(s.projectPath, op)).slice(0, 160) || `${label} done`); s.bumpGit() } catch (e) { s.toast('error', (e as Error).message) } } })
  return [
    { id: 'new-sql', label: 'New SQL Query', run: () => void st().newSqlTab('') },
    { id: 'sidebar-side', label: 'View: Toggle Sidebar Position (Left / Right)', run: () => st().setLayout({ sidebar: st().layout.sidebar === 'left' ? 'right' : 'left' }) },
    { id: 'terminal-side', label: 'View: Toggle Terminal Position (Bottom / Right)', run: () => st().setLayout({ terminal: st().layout.terminal === 'bottom' ? 'right' : 'bottom' }) },
    { id: 'results-side', label: 'View: Toggle Results Position (Below / Beside Editor)', run: () => st().setLayout({ results: st().layout.results === 'bottom' ? 'right' : 'bottom' }) },
    { id: 'focus', label: 'View: Focus Mode (editor only)', run: () => st().toggleFocusMode() },
    { id: 'go-table', label: 'Go to Table…', hint: `${mod()}+E`, run: () => st().setDialog({ type: 'palette', mode: 'tables' }) },
    { id: 'connect', label: 'Connect Database', run: () => st().setDialog({ type: 'connection' }) },
    { id: 'new-file', label: 'New File', run: async () => { const s = st(); if (!s.projectPath) return s.toast('error', 'Open a project first'); const n = await s.prompt({ title: 'New File', label: 'File name' }); if (n) { await bridge().fs.createFile(joinPath(s.projectPath, n)).catch((e) => s.toast('error', e.message)); s.bumpFs(); void s.openFile(joinPath(s.projectPath, n)) } } },
    { id: 'new-folder', label: 'New Folder', run: async () => { const s = st(); if (!s.projectPath) return s.toast('error', 'Open a project first'); const n = await s.prompt({ title: 'New Folder', label: 'Folder name' }); if (n) { await bridge().fs.createDir(joinPath(s.projectPath, n)).catch((e) => s.toast('error', e.message)); s.bumpFs() } } },
    { id: 'open-project', label: 'Open Project…', run: async () => { const p = await bridge().fs.pickFolder(); if (p) await st().openProject(p) } },
    { id: 'clone', label: 'Clone Repository…', run: () => st().setDialog({ type: 'clone' }) },
    { id: 'terminal', label: 'Open Terminal', run: () => useTerms.getState().add() },
    git('pull', 'Git Pull'), git('push', 'Git Push'),
    { id: 'git-commit', label: 'Git Commit', run: () => st().setLeftPanel('git') },
    { id: 'format', label: 'Format SQL', run: () => { const s = st(), t = s.tabs.find((x) => x.id === s.activeTabId); if (t?.kind === 'sql') s.updateTab(t.id, { content: formatSql(t.content, (t.connId && s.sessions[t.connId]?.engine) || 'mysql', s.settings.tabSize), dirty: true }) } },
    { id: 'run', label: 'Run Query', hint: `${mod()}+Enter`, run: () => { const s = st(); if (s.activeTabId) void s.runSql(s.activeTabId, 'all') } },
    { id: 'export', label: 'Export Results (CSV)', run: async () => { const s = st(), r = s.activeTabId ? s.results[s.activeTabId]?.result : undefined; if (!r) return s.toast('error', 'Run a query first'); const { toCsv } = await import('../lib/exporters'); await bridge().fs.saveDialog('results.csv', toCsv(r.columns, r.rows)) } },
    { id: 'settings', label: 'Open Settings', run: () => st().openTab({ id: 'settings', kind: 'settings', title: 'Settings' }) },
    { id: 'theme', label: 'Change Theme (cycle dark / light / system)', run: () => { const s = st(); s.setSettings({ theme: ({ dark: 'light', light: 'system', system: 'dark' } as const)[s.settings.theme] }) } },
    { id: 'font+', label: 'Change Font Size: Increase', hint: `${mod()}++`, run: () => st().setSettings({ fontSize: Math.min(48, st().settings.fontSize + 1) }) },
    { id: 'font-', label: 'Change Font Size: Decrease', hint: `${mod()}+-`, run: () => st().setSettings({ fontSize: Math.max(8, st().settings.fontSize - 1) }) },
    { id: 'font0', label: 'Change Font Size: Reset (14)', hint: `${mod()}+0`, run: () => st().setSettings({ fontSize: 14 }) },
    { id: 'about', label: 'About MySQL Forge Studio', run: () => st().setDialog({ type: 'about' }) },
  ]
}

export default function Palette({ mode }: { mode: 'commands' | 'files' | 'tables' }) {
  const st = useApp()
  const cmds = useCommands()
  const [q, setQ] = useState('')
  const [files, setFiles] = useState<{ name: string; path: string }[]>([])
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (mode !== 'files' || !st.projectPath) return
    let live = true
    const walk = async (dir: string, depth: number, out: { name: string; path: string }[]) => {
      if (depth > 4 || out.length > 3000) return
      for (const e of await bridge().fs.list(dir).catch(() => [])) {
        if (/^(node_modules|\.git|vendor|target|dist|__pycache__|\.venv)$/.test(e.name)) continue
        if (e.isDir) await walk(e.path, depth + 1, out); else out.push({ name: e.name, path: e.path })
      }
    }
    const out: { name: string; path: string }[] = []
    walk(st.projectPath, 0, out).then(() => live && setFiles(out))
    return () => { live = false }
  }, [mode, st.projectPath])
  const items = useMemo(() => {
    type Row = { id: string; label: string; hint?: string; run: () => void | Promise<void>; kind?: string }
    let rows: Row[]
    if (mode === 'files') rows = files.map((f) => ({ id: f.path, label: f.name, hint: f.path.replace(st.projectPath ?? '', ''), run: () => st.openFile(f.path) }))
    else if (mode === 'tables') {
      const id = st.activeConnId
      const spaces = (id && st.schemaCache[id]) || {}
      const sel = id ? st.selectedNs[id] : undefined
      rows = Object.entries(spaces).flatMap(([ns, info]) => Object.entries(info.tables).map(([t, v]) => ({
        id: `${ns}.${t}`, label: t, kind: v.kind, hint: `${v.kind} · ${v.columns.length} columns · ${ns}`,
        run: () => { if (id) st.openTab({ id: `tbl:${id}:${ns}:${t}`, kind: 'table', title: t, connId: id, ns, table: t }) },
        boost: ns === sel ? 50 : 0,
      } as Row & { boost: number })))
    } else rows = cmds
    // match first, boost afterwards: a non-matching row must never be rescued by its boost
    const scored = rows
      .map((r) => ({ r, base: Math.max(fuzzyScore(q, r.label), r.hint && q ? fuzzyScore(q, r.hint) - 300 : -1) }))
      .filter((x) => x.base >= 0 || !q)
      .map((x) => ({ r: x.r, sc: x.base + ((x.r as { boost?: number }).boost ?? 0) }))
    return (q ? scored.sort((a, b) => b.sc - a.sc) : scored).slice(0, 60).map((x) => x.r)
  }, [q, files, mode, st.activeConnId, st.schemaCache]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = (c: { run: () => void | Promise<void> }) => { st.setDialog(null); void c.run() }
  return (
    <Modal title={mode === 'files' ? 'Quick Open' : mode === 'tables' ? 'Go to Table' : 'Command Palette'} onClose={() => st.setDialog(null)}>
      <div className="p-2">
        <input ref={input} autoFocus aria-label="Search" className="input" placeholder={mode === 'files' ? 'Search files by name…' : mode === 'tables' ? 'Search tables…' : 'Type a command…'} value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) } else if (e.key === 'Enter' && items[sel]) run(items[sel]) }} />
        <div role="listbox" className="mt-2 max-h-80 overflow-auto">
          {items.map((c, i) => <button key={c.id} role="option" aria-selected={i === sel} className={`flex w-full items-center justify-between rounded px-3 py-1.5 text-left text-xs ${i === sel ? 'bg-accent/20' : 'hover:bg-raised'}`} onMouseEnter={() => setSel(i)} onClick={() => run(c)}><span>{c.label}</span>{'hint' in c && c.hint && <span className="code ml-3 truncate text-[10px] text-muted">{c.hint}</span>}</button>)}
          {!items.length && <div className="p-3 text-center text-xs text-muted">{mode === 'files' && !st.projectPath ? 'Open a project first.' : mode === 'tables' && !st.activeConnId ? 'Connect to a database first.' : 'No matches.'}</div>}
        </div>
      </div>
    </Modal>
  )
}

export function SaveQueryDialog({ sql }: { sql: string }) {
  const st = useApp()
  const [t, setT] = useState('')
  return (
    <Modal title="Save query" onClose={() => st.setDialog(null)} width="max-w-md">
      <form className="space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); if (t.trim()) { st.addSaved(t.trim(), sql); st.toast('success', 'Query saved'); st.setDialog(null) } }}>
        <label className="block text-xs"><span className="mb-1 block text-muted">Title</span><input autoFocus className="input" value={t} onChange={(e) => setT(e.target.value)} /></label>
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => st.setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={!t.trim()}>Save</button></div>
      </form>
    </Modal>
  )
}
