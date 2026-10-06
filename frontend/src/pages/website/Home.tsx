import { Link } from 'react-router-dom'
import { Braces, Database, GitBranch, Lock, Pencil, SquareTerminal } from 'lucide-react'
import AppShot from './AppShot'
import DownloadSection, { CopyBtn } from './DownloadSection'
import { REPO, Section, SectionHead, usePageMeta } from './Layout'

const FEATURES = [
  { i: Braces, t: 'SQL editor on Monaco', d: 'Schema-aware autocomplete ranked by relevance, JOIN conditions generated from foreign keys, snippets, formatting, split view and JetBrains Mono.' },
  { i: Database, t: 'Five database engines', d: 'MySQL, MariaDB, PostgreSQL, SQLite and SQL Server in one client. Big schemas stay fast: only the rows you see are drawn.' },
  { i: Pencil, t: 'Edit data, safely', d: 'A spreadsheet grid that is read-only until you switch on Edit Data. Changes are previewed, then written in one transaction.' },
  { i: SquareTerminal, t: 'Integrated terminal', d: 'Real Git Bash, PowerShell, CMD, zsh and bash in tabs, opened in your project folder. Ctrl+` toggles it.' },
  { i: GitBranch, t: 'Git & project explorer', d: 'Stage, commit, branch, diff, pull and push. Laravel, Django and Node projects are detected with one-click commands.' },
  { i: Lock, t: 'Private by design', d: 'Passwords live in your OS keychain. Queries, results, files and repositories never leave your machine. Production connections are flagged and confirmed.' },
]
const MORE = ['Table designer', 'ER diagrams', 'Query history', 'Command palette', 'Tabs & split editor', 'Table search (Ctrl+E)', 'Import connection URL', 'Export CSV · JSON · SQL · Excel · Markdown']

const STACK = ['MySQL', 'MariaDB', 'PostgreSQL', 'SQLite', 'SQL Server', 'Laravel', 'PHP', 'Python', 'Django', 'Node.js', 'TypeScript', 'React', 'Vue.js', 'SQL', 'Git', 'Laragon', 'WAMP', 'XAMPP']

const SNIPPETS = [
  { t: 'SELECT … FROM', tag: 'sel', code: 'SELECT *\nFROM crm_deals\nWHERE status = \'open\'\nLIMIT 100;' },
  { t: 'JOIN from a foreign key', tag: 'auto', code: 'FROM crm_contact_employee cce\nJOIN crm_contacts cc\n  ON cc.id = cce.crm_contact_id' },
  { t: 'Quick select', tag: 'type a table', code: '-- type "crm_dea" and pick:\nSELECT * FROM crm_deals\nLIMIT 100;' },
  { t: 'INSERT INTO', tag: 'ins', code: 'INSERT INTO users (name, email)\nVALUES (\'Ada\', \'ada@forge.dev\');' },
  { t: 'WITH (CTE)', tag: 'with', code: 'WITH recent AS (\n  SELECT * FROM orders\n  WHERE created_at > NOW() - INTERVAL 7 DAY\n)\nSELECT COUNT(*) FROM recent;' },
  { t: 'CREATE TABLE', tag: 'per engine', code: 'CREATE TABLE users (\n  id BIGINT UNSIGNED AUTO_INCREMENT,\n  name VARCHAR(255) NOT NULL,\n  PRIMARY KEY (id)\n);' },
]
const THEMES = [
  { n: 'Dark', d: 'Default', bg: '#0d0d0d', bar: '#171717', fg: '#e5e7eb', ac: '#22bee8' },
  { n: 'Light', d: 'Bright & crisp', bg: '#ffffff', bar: '#eef2f7', fg: '#161e2e', ac: '#087ea4' },
  { n: 'System', d: 'Follows your OS', bg: 'linear-gradient(90deg,#0d0d0d 50%,#fff 50%)', bar: '#8886', fg: '#9ca3af', ac: '#22bee8' },
]

const WORKFLOWS = [
  { t: 'Laragon · WAMP · XAMPP', tags: ['auto-detect', 'one click'], d: 'Open your stack and the MySQL server it runs is found automatically. Start a stopped server from the app and connect the moment it is up.', code: '● Laragon  MySQL 8.0.30  127.0.0.1:3306  connected' },
  { t: 'Laravel project', tags: ['PHP', 'artisan'], d: 'Detected from artisan and composer.json, with the commands you use every day one click away in the terminal.', code: 'php artisan migrate\nphp artisan serve\nphp artisan route:list' },
  { t: 'Django project', tags: ['Python', 'manage.py'], d: 'Detected from manage.py. Browse the tables your models create and run migrations without leaving the window.', code: 'python manage.py makemigrations\npython manage.py migrate\npython manage.py runserver' },
]

const SOURCE = [
  { t: 'Clone and run the interface', code: 'git clone https://github.com/Asda168/sql-tool.git\ncd sql-tool/frontend\nnpm install\nnpm run dev        # http://localhost:5173' },
  { t: 'Start the API (accounts, releases, downloads)', code: 'cd backend\npython -m venv .venv && .venv\\Scripts\\activate\npip install -r requirements.txt\npython manage.py migrate\npython manage.py runserver' },
  { t: 'Windows quick start with real databases', code: 'node desktop/host/add-connection.mjs --help   # optional: save a connection\nscripts\\launch-forge.vbs                       # opens the app window' },
  { t: 'Build the native app (needs Rust)', code: 'cd desktop\nnpm install\nnpm run build       # installer in src-tauri/target/release/bundle' },
]

function Code({ text, className = '' }: { text: string; className?: string }) {
  return <div className={`relative ${className}`}><pre className="code overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-4 pr-12 text-[12.5px] leading-6 text-white/80"><code>{text}</code></pre><CopyBtn text={text} /></div>
}

export default function Home() {
  usePageMeta()
  return (
    <>
      {/* hero */}
      <div className="relative overflow-hidden">
        <div className="site-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-[-12rem] h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]" aria-hidden />
        <div className="pointer-events-none absolute right-[-8rem] top-40 h-72 w-72 rounded-full bg-violet/15 blur-[100px]" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pb-8 pt-36 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1 text-xs text-muted"><span className="h-1.5 w-1.5 rounded-full bg-mint" />v1.0 · Free · Windows, macOS &amp; Linux</div>
          <h1 className="text-glow mx-auto max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">Write SQL. Manage Code. <span className="text-accent">Connect. Build.</span></h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">A fast desktop SQL IDE for MySQL, MariaDB, PostgreSQL, SQLite and SQL Server — editor, data grid, terminal and Git in one clean workspace.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link className="btn-neon !px-7 !py-3" to={{ pathname: '/', hash: '#download' }}>Download MySQL Forge Studio</Link>
            <a className="btn-ghost !px-7 !py-3" href={REPO} target="_blank" rel="noreferrer">View on GitHub</a>
          </div>
          <p className="mt-4 text-xs text-muted">or <Link className="text-accent underline-offset-2 hover:underline" to="/app">try it in your browser</Link> with a built-in demo database</p>
        </div>
        <div className="relative mx-auto max-w-5xl px-5 pb-10"><AppShot /></div>
      </div>

      {/* features */}
      <Section id="features">
        <SectionHead eyebrow="Features" title="Everything you need, nothing you don’t" sub="One workspace for the database, the code and the terminal." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => <div key={f.t} className="card"><span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent"><f.i size={20} /></span><h3 className="font-semibold">{f.t}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted">{f.d}</p></div>)}
        </div>
        <ul className="mt-6 flex flex-wrap gap-2">{MORE.map((m) => <li key={m} className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted">{m}</li>)}</ul>
      </Section>

      {/* stack */}
      <Section id="engines" className="!py-10">
        <SectionHead eyebrow="Engines & stacks" title="Built for your stack" />
        <ul className="flex flex-wrap gap-2.5">{STACK.map((s, i) => <li key={s} className={`rounded-lg border px-4 py-2 text-sm ${i < 5 ? 'border-accent/40 bg-accent/10 text-fg' : 'border-white/10 bg-white/[0.03] text-muted'}`}>{s}</li>)}</ul>
      </Section>

      {/* snippets & themes */}
      <Section id="snippets">
        <SectionHead eyebrow="Snippets & themes" title="Suggestions that know your schema" sub="Table and column names come from the connected database. JOIN conditions come from its foreign keys. Snippets cover the syntax you type every day." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SNIPPETS.map((s) => (
            <div key={s.t} className="card !p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4"><h3 className="font-semibold">{s.t}</h3><span className="rounded border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">{s.tag}</span></div>
              <pre className="code m-4 overflow-x-auto rounded-lg bg-black/50 p-3 text-[12px] leading-5 text-white/75"><code>{s.code}</code></pre>
            </div>
          ))}
        </div>
        <h3 className="mb-4 mt-12 text-lg font-semibold">Themes</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {THEMES.map((t) => (
            <div key={t.n} className="card flex items-center gap-4">
              <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md border border-white/15" style={{ background: t.bg }} aria-hidden><span className="absolute inset-x-0 top-0 h-3" style={{ background: t.bar }} /><span className="absolute bottom-2 left-2 h-1.5 w-10 rounded" style={{ background: t.ac }} /><span className="absolute bottom-5 left-2 h-1.5 w-14 rounded opacity-60" style={{ background: t.fg }} /></span>
              <div><div className="font-semibold">{t.n}</div><div className="text-xs text-muted">{t.d}</div></div>
            </div>
          ))}
        </div>
      </Section>

      {/* workflows */}
      <Section id="workflows">
        <SectionHead eyebrow="Workflows" title="Made for how you build" sub="Project types and local servers are recognised automatically." />
        <div className="grid gap-4 lg:grid-cols-3">
          {WORKFLOWS.map((w) => (
            <div key={w.t} className="card flex flex-col">
              <h3 className="font-semibold">{w.t}</h3>
              <div className="mt-2 flex gap-1.5">{w.tags.map((t) => <span key={t} className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] text-violet">{t}</span>)}</div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{w.d}</p>
              <pre className="code mt-4 overflow-x-auto rounded-lg bg-black/50 p-3 text-[12px] leading-5 text-mint/90"><code>{w.code}</code></pre>
            </div>
          ))}
        </div>
      </Section>

      <DownloadSection />

      {/* source */}
      <Section id="source">
        <SectionHead eyebrow="Open source" title="Run it from source" sub="Works today on Windows with Node 20+ and Python 3.12+. The web interface also runs on macOS and Linux." />
        <div className="grid gap-5 lg:grid-cols-2">
          {SOURCE.map((s) => <div key={s.t} className="min-w-0"><h3 className="mb-2 text-sm font-semibold">{s.t}</h3><Code text={s.code} /></div>)}
        </div>
        <p className="mt-6 text-sm text-muted">Full setup, architecture and security notes are in the <Link to="/docs" className="text-accent hover:underline">documentation</Link> and the <a className="text-accent hover:underline" href={REPO} target="_blank" rel="noreferrer">repository</a>.</p>
      </Section>
    </>
  )
}
