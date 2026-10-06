import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, GitBranch, GitCommit as CommitIcon, GitFork, Minus, Plus, RefreshCw } from 'lucide-react'
import { bridge, type GitBranch as Branch, type GitCommit, type GitStatus } from '../bridge'
import { useApp } from '../store/app'
import { Empty, useContextMenu } from '../components/ui'

const CODE: Record<string, string> = { M: 'M', A: 'A', D: 'D', R: 'R', '?': 'U' }

function Section({ title, count, children, actions }: { title: string; count?: number; children: React.ReactNode; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-line">
      <div className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <button className="flex-1 text-left" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} {title}{count !== undefined ? ` (${count})` : ''}</button>{actions}
      </div>
      {open && children}
    </div>
  )
}

export default function GitPanel() {
  const st = useApp()
  const cwd = st.projectPath
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [remotes, setRemotes] = useState<{ name: string; url: string }[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [diff, setDiff] = useState<{ path: string; text: string } | null>(null)
  const { menu, open: ctxOpen } = useContextMenu()
  const g = bridge().git

  const refresh = useCallback(async () => {
    if (!cwd) return
    try {
      const s = await g.status(cwd)
      setStatus(s)
      if (s.isRepo) {
        const [b, c, r] = await Promise.all([g.branches(cwd), g.log(cwd, 30).catch(() => []), g.remotes(cwd).catch(() => [])])
        setBranches(b); setCommits(c); setRemotes(r)
      }
    } catch (e) { setStatus(null); st.toast('error', (e as Error).message ?? String(e)) }
  }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh() }, [refresh, st.gitVersion, st.fsVersion])
  useEffect(() => {
    if (!st.settings.gitAutoFetch || !cwd) return
    const t = setInterval(() => void g.run(cwd, 'fetch').then(refresh, () => {}), 5 * 60_000)
    return () => clearInterval(t)
  }, [st.settings.gitAutoFetch, cwd, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (label: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(label)
    try { const r = await fn(); st.toast('success', ok ?? (typeof r === 'string' && r ? r.slice(0, 200) : `${label} done`)); st.bumpFs() } catch (e) { st.toast('error', `${label}: ${(e as Error).message ?? e}`) }
    setBusy(''); await refresh()
  }

  if (!cwd) return <Empty>Open a project to use Git.</Empty>
  if (status && !status.isRepo) {
    return (
      <div className="p-3 text-xs">
        <p className="mb-3 text-muted">This folder is not a Git repository.</p>
        <button className="btn btn-primary w-full justify-center" onClick={() => act('Initialize', () => g.init(cwd), 'Repository initialized')}><GitFork size={13} />Initialize Repository</button>
        <button className="btn mt-2 w-full justify-center" onClick={() => st.setDialog({ type: 'clone' })}>Clone Repository…</button>
      </div>
    )
  }
  if (!status) return <Empty>Loading…</Empty>

  const staged = status.changes.filter((c) => c.index !== ' ' && c.index !== '?')
  const unstaged = status.changes.filter((c) => c.worktree !== ' ')
  const showDiff = async (path: string, isStaged: boolean) => { try { setDiff({ path, text: (await g.diff(cwd, path, isStaged)) || '(no textual changes)' }) } catch (e) { st.toast('error', (e as Error).message) } }
  const file = (path: string, code: string, isStaged: boolean) => (
    <div key={(isStaged ? 's:' : 'u:') + path} className="group flex cursor-pointer items-center gap-1.5 px-2 py-[3px] text-xs hover:bg-raised" onClick={() => showDiff(path, isStaged)}
      onContextMenu={(e) => ctxOpen(e, [{ label: 'Open file', onClick: () => void st.openFile(`${cwd.replace(/[\\/]$/, '')}/${path}`) }, { label: 'View diff', onClick: () => showDiff(path, isStaged) }, { label: 'View history', onClick: async () => setDiff({ path, text: (await g.log(cwd, 20, path)).map((c) => `${c.hash}  ${c.message}  (${c.author})`).join('\n') || 'No history' }) }])}>
      <span className={`w-4 text-center font-bold ${code === 'D' ? 'text-danger' : code === 'A' || code === 'U' ? 'text-ok' : 'text-warn'}`} title={code}>{CODE[code] ?? code}</span>
      <span className="truncate">{path}</span>
      <button className="ml-auto hidden rounded p-0.5 hover:bg-line group-hover:block" aria-label={isStaged ? `Unstage ${path}` : `Stage ${path}`} onClick={(e) => { e.stopPropagation(); void act(isStaged ? 'Unstage' : 'Stage', () => (isStaged ? g.unstage(cwd, [path]) : g.stage(cwd, [path])), 'Updated') }}>{isStaged ? <Minus size={12} /> : <Plus size={12} />}</button>
    </div>
  )
  const ask = async (title: string, label: string) => st.prompt({ title, label, confirmLabel: 'OK' })

  return (
    <div className="flex h-full flex-col overflow-auto text-xs">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <GitBranch size={13} className="text-accent" /><span className="code truncate font-semibold">{status.branch}</span>
        {(status.ahead > 0 || status.behind > 0) && <span className="text-muted">↑{status.ahead} ↓{status.behind}</span>}
        <div className="flex-1" />
        <button className="btn !px-1.5" title="Fetch" aria-label="Fetch" disabled={!!busy} onClick={() => act('Fetch', () => g.run(cwd, 'fetch'), 'Fetched')}><RefreshCw size={12} className={busy ? 'animate-spin' : ''} /></button>
        <button className="btn !px-1.5" title="Pull" aria-label="Pull" disabled={!!busy} onClick={() => act('Pull', () => g.run(cwd, 'pull'))}><ArrowDown size={12} /></button>
        <button className="btn !px-1.5" title="Push" aria-label="Push" disabled={!!busy} onClick={() => act('Push', () => g.run(cwd, 'push'))}><ArrowUp size={12} /></button>
      </div>
      <div className="border-b border-line p-2">
        <textarea aria-label="Commit message" className="input code h-16 resize-none" placeholder="Commit message" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div className="mt-1.5 flex gap-1.5">
          <button className="btn btn-primary flex-1 justify-center" disabled={!msg.trim() || !staged.length || !!busy} onClick={() => act('Commit', async () => { await g.commit(cwd, msg.trim()); setMsg('') }, 'Committed')}><CommitIcon size={12} />Commit{staged.length ? ` (${staged.length})` : ''}</button>
          <button className="btn" onClick={() => act('Stash', () => g.run(cwd, 'stash'))}>Stash</button>
          <button className="btn" onClick={() => act('Stash pop', () => g.run(cwd, 'stash-pop'))}>Pop</button>
        </div>
      </div>
      <Section title="Staged Changes" count={staged.length} actions={staged.length ? <button className="btn !px-1 !py-0 normal-case" onClick={() => act('Unstage all', () => g.unstage(cwd, staged.map((c) => c.path)))}>−all</button> : null}>
        {staged.map((c) => file(c.path, c.index, true))}{!staged.length && <div className="px-3 py-1 text-muted">Nothing staged</div>}
      </Section>
      <Section title="Changes" count={unstaged.length} actions={unstaged.length ? <button className="btn !px-1 !py-0 normal-case" onClick={() => act('Stage all', () => g.stage(cwd, unstaged.map((c) => c.path)))}>+all</button> : null}>
        {unstaged.map((c) => file(c.path, c.worktree, false))}{!unstaged.length && <div className="px-3 py-1 text-muted">Working tree clean</div>}
      </Section>
      <Section title="Branches" count={branches.length} actions={<button className="btn !px-1 !py-0 normal-case" onClick={async () => { const n = await ask('Create Branch', 'Branch name'); if (n) void act('Create branch', () => g.createBranch(cwd, n), `Switched to ${n}`) }}>+ new</button>}>
        {branches.map((b) => <div key={b.name} className={`flex cursor-pointer items-center gap-1.5 px-3 py-[3px] hover:bg-raised ${b.current ? 'font-semibold text-accent' : ''}`} onDoubleClick={() => !b.current && act('Checkout', () => g.checkout(cwd, b.name), `Switched to ${b.name}`)}
          onContextMenu={(e) => ctxOpen(e, [{ label: 'Checkout', disabled: b.current, onClick: () => void act('Checkout', () => g.checkout(cwd, b.name), `Switched to ${b.name}`) }, { label: `Merge into ${status.branch}`, disabled: b.current, onClick: () => void act('Merge', () => g.run(cwd, 'merge', b.name)) }, { label: `Rebase ${status.branch} onto this`, disabled: b.current, onClick: () => void act('Rebase', () => g.run(cwd, 'rebase', b.name)) }])}>
          <GitBranch size={11} />{b.name}{b.current && ' ✓'}</div>)}
      </Section>
      <Section title="Commits" count={commits.length}>
        {commits.map((c) => <div key={c.hash} className="px-3 py-1 hover:bg-raised" title={`${c.author} · ${c.date}`}><span className="code mr-1.5 text-accent">{c.hash.slice(0, 7)}</span>{c.message}</div>)}
        {!commits.length && <div className="px-3 py-1 text-muted">No commits yet</div>}
      </Section>
      <Section title="Remotes" count={remotes.length}>
        {remotes.map((r) => <div key={r.name} className="px-3 py-1" title={r.url}><span className="font-semibold">{r.name}</span> <span className="code text-muted">{r.url}</span></div>)}
        {!remotes.length && <div className="px-3 py-1 text-muted">No remotes</div>}
      </Section>
      {diff && (
        <div className="fixed inset-x-10 bottom-10 top-20 z-40 flex flex-col rounded-xl border border-line bg-panel shadow-2xl" role="dialog" aria-label={`Diff ${diff.path}`}>
          <div className="flex items-center justify-between border-b border-line px-4 py-2"><span className="code text-sm">{diff.path}</span><button className="btn" onClick={() => setDiff(null)}>Close</button></div>
          <pre className="code min-h-0 flex-1 overflow-auto p-3 text-[12.5px]">{diff.text.split('\n').map((l, i) => <div key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'bg-ok/15 text-ok' : l.startsWith('-') && !l.startsWith('---') ? 'bg-danger/15 text-danger' : l.startsWith('@@') ? 'text-accent' : ''}>{l || ' '}</div>)}</pre>
        </div>
      )}
      {menu}
    </div>
  )
}
