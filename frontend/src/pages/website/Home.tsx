import { Link } from 'react-router-dom'
import { Braces, Database, FolderTree, GitBranch, History, Network, ShieldCheck, SquareTerminal, Table2, Zap } from 'lucide-react'
import { H1, REPO, Section, usePageMeta } from './Layout'

function IdeMock() {
  const rows = [['1', 'Ada Lovelace', 'ada@example.com'], ['2', 'Alan Turing', 'alan@example.com'], ['3', 'Grace Hopper', 'grace@example.com'], ['4', 'Linus T.', 'linus@example.com']]
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel text-left shadow-2xl" role="img" aria-label="Screenshot-style illustration of the IDE: project explorer, SQL editor, database explorer, terminal and results">
      <div className="flex items-center gap-1.5 border-b border-line bg-raised px-3 py-2"><i className="h-2.5 w-2.5 rounded-full bg-danger/70" /><i className="h-2.5 w-2.5 rounded-full bg-warn/70" /><i className="h-2.5 w-2.5 rounded-full bg-ok/70" /><span className="ml-3 text-[11px] text-muted">MySQL Forge Studio — users.sql</span></div>
      <div className="grid grid-cols-[130px_1fr_150px] text-[11px] max-md:grid-cols-[1fr]">
        <div className="border-r border-line p-2 max-md:hidden"><div className="mb-1 font-semibold text-muted">PROJECT</div>{['app', 'config', 'database', '  users.sql', '  orders.sql', 'public', 'src', 'README.md'].map((f) => <div key={f} className={`whitespace-pre py-0.5 ${f.includes('users') ? 'text-accent' : ''}`}>{f.includes('.') ? '📄' : '📁'} {f.trim()}</div>)}</div>
        <div>
          <pre className="code border-b border-line p-3 leading-5 text-[12px]"><span className="text-accent">SELECT</span>{'\n    id,\n    name,\n    email\n'}<span className="text-accent">FROM</span>{' users\n'}<span className="text-accent">WHERE</span>{" status = "}<span className="text-ok">'active'</span>{'\n'}<span className="text-accent">ORDER BY</span>{' created_at '}<span className="text-accent">DESC</span>;</pre>
          <div className="px-3 py-1 text-ok">✓ Query completed successfully · 1,245 rows · 0.124 seconds</div>
          <table className="code w-full text-left"><thead className="bg-raised text-muted"><tr><th className="px-3 py-1">id</th><th>name</th><th>email</th></tr></thead><tbody>{rows.map((r) => <tr key={r[0]} className="border-t border-line/60">{r.map((c, i) => <td key={i} className={i === 0 ? 'px-3 py-1' : ''}>{c}</td>)}</tr>)}</tbody></table>
          <div className="code border-t border-line bg-bg px-3 py-2 text-muted">$ git status<br /><span className="text-ok">On branch main — nothing to commit</span></div>
        </div>
        <div className="border-l border-line p-2 max-md:hidden"><div className="mb-1 font-semibold text-muted">DATABASE</div>{['🛢 forge_dev', ' ▸ Tables (4)', '   users', '   orders', '   products', ' ▸ Views', ' ▸ Procedures'].map((f) => <div key={f} className="whitespace-pre py-0.5">{f}</div>)}</div>
      </div>
    </div>
  )
}

const FEATURES = [
  { i: Database, t: 'Five database engines', d: 'MySQL, MariaDB, PostgreSQL, SQLite and SQL Server in one client, with lazy schema loading for thousands of tables.' },
  { i: Braces, t: 'A real SQL editor', d: 'Monaco-powered editing with schema-aware autocomplete, formatting, folding, multi-cursor, split view and JetBrains Mono.' },
  { i: Table2, t: 'Spreadsheet-style data', d: 'Virtualized results, inline editing, add/duplicate/delete rows, and a Save Changes button that runs one transaction.' },
  { i: ShieldCheck, t: 'Safe by default', d: 'Destructive queries and production connections ask first. Passwords live in your OS keychain, never in the app files.' },
  { i: Network, t: 'Table designer and ERD', d: 'Design tables visually, generate SQL for each engine, and explore relationships with a zoomable diagram.' },
  { i: SquareTerminal, t: 'Terminal built in', d: 'Git Bash, PowerShell, CMD, zsh and bash in tabs, opened right in your project folder.' },
  { i: GitBranch, t: 'Git without leaving', d: 'Stage, commit, branch, diff, pull, push, stash, merge and rebase from a focused panel.' },
  { i: FolderTree, t: 'Project workspace', d: 'Open Laravel, Django, Node or plain projects. Create, rename and move files; run framework commands in one click.' },
  { i: History, t: 'Query history', d: 'Every query is recorded with its connection, duration and status. Re-run, edit, copy or save it.' },
  { i: Zap, t: 'Fast and light', d: 'A native Tauri + Rust shell instead of a heavyweight runtime. Fast startup, low memory, large result sets stay smooth.' },
]

export function Features() {
  usePageMeta('Features', 'Every feature in MySQL Forge Studio: multi-engine SQL client, editor, table designer, ERD, Git and terminal.')
  return (<><H1 sub="One workspace for databases, code, Git and the terminal.">Everything you need to build</H1>
    <Section><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{FEATURES.map((f) => <div key={f.t} className="rounded-xl border border-line bg-panel p-5"><f.i className="mb-3 text-accent" size={22} /><h3 className="font-semibold">{f.t}</h3><p className="mt-1 text-sm text-muted">{f.d}</p></div>)}</div></Section></>)
}

export function MysqlTools() {
  usePageMeta('MySQL tools', 'Connection manager, schema explorer, table designer, data editor and ERD for MySQL and MariaDB.')
  const items = [['Connections', 'Groups for LOCAL, DEVELOPMENT, STAGING and PRODUCTION, each with a clear text-and-symbol badge, SSL and SSH tunnel options, and Test Connection before you save.'], ['Schema explorer', 'Tables, views, procedures, functions, triggers and events, loaded lazily. Click a table for columns, keys, indexes, defaults and comments.'], ['Table designer', 'Add columns, indexes and foreign keys visually and watch the CREATE TABLE statement update live.'], ['Data editor', 'Edit cells inline and review every pending change before one confirmed transaction writes it.'], ['ERD', 'Zoom, pan, search, export as an image or as SQL.'], ['Safety checks', 'Statements are parsed first. DROP, TRUNCATE, ALTER, and DELETE/UPDATE without WHERE need your confirmation.']]
  return (<><H1 sub="Built first for MySQL and MariaDB. PostgreSQL, SQLite and SQL Server work too.">MySQL tools that stay out of your way</H1>
    <Section><div className="grid gap-4 md:grid-cols-2">{items.map(([t, d]) => <div key={t} className="rounded-xl border border-line bg-panel p-5"><h3 className="font-semibold text-accent">{t}</h3><p className="mt-1 text-sm text-muted">{d}</p></div>)}</div></Section></>)
}

export function EditorPage() {
  usePageMeta('Code editor', 'A VS Code-style editor with JetBrains Mono, Git, terminal and project detection for Laravel, Django and Node.')
  return (<><H1 sub="Edit your SQL and your source code in the same window.">A code editor developers like</H1>
    <Section className="grid gap-8 md:grid-cols-2">
      <div className="space-y-3 text-sm text-muted"><p>JetBrains Mono at 14px by default, with ligatures, weights 300–700, adjustable line height and letter spacing, and zoom with <kbd className="code">Ctrl</kbd> + <kbd className="code">+</kbd> / <kbd className="code">-</kbd> / <kbd className="code">0</kbd> or the mouse wheel.</p><p>PHP, Python, JavaScript, TypeScript, React, Vue, HTML, CSS, SCSS, JSON, YAML, SQL and Markdown with syntax highlighting, find and replace, find in files, go to line and go to symbol.</p><p>Laravel, Django and Node projects are detected automatically, with one-click commands such as <code className="code">php artisan migrate</code> and <code className="code">python manage.py runserver</code>.</p><p>Files are never modified without an explicit action from you.</p></div>
      <IdeMock /></Section></>)
}

export default function Home() {
  usePageMeta()
  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-16 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">MySQL development,<br /><span className="text-accent">without the clutter.</span></h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">Query your database, edit source code, manage Git repositories, and use your terminal from one beautiful workspace.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3"><Link className="btn btn-primary !px-5 !py-2.5 text-sm" to="/download">Download MySQL Forge Studio</Link><Link className="btn !px-5 !py-2.5 text-sm" to="/features">Explore Features</Link></div>
        <p className="mt-3 text-xs text-muted">Free · Windows, macOS and Linux · or <Link className="text-accent underline" to="/app">try it in your browser</Link></p>
      </div>
      <div className="mx-auto max-w-5xl px-4 pb-10"><IdeMock /></div>
      <Section><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{FEATURES.slice(0, 4).map((f) => <div key={f.t} className="rounded-xl border border-line bg-panel p-5"><f.i className="mb-3 text-accent" size={22} /><h3 className="font-semibold">{f.t}</h3><p className="mt-1 text-sm text-muted">{f.d}</p></div>)}</div>
        <p className="mt-6 text-center"><Link className="text-accent underline" to="/features">See all features →</Link> · <a className="text-accent underline" href={REPO} target="_blank" rel="noreferrer">View on GitHub</a></p></Section>
    </>
  )
}
