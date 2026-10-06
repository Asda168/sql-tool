import { useState } from 'react'
import { SHORTCUTS } from '../../settings/SettingsTab'
import { H1, Section, usePageMeta } from './Layout'

interface Doc { id: string; title: string; body: React.ReactNode }
const C = ({ children }: { children: React.ReactNode }) => <code className="code rounded bg-raised px-1">{children}</code>
const P = ({ children }: { children: React.ReactNode }) => <p className="mb-3">{children}</p>
const Pre = ({ children }: { children: string }) => <pre className="code mb-3 overflow-auto rounded-lg border border-line bg-panel p-3 text-[13px]">{children}</pre>

export const DOCS: Doc[] = [
  { id: 'getting-started', title: 'Getting Started', body: <><P>MySQL Forge Studio is a desktop workspace for SQL, source code, Git and the terminal. Install it, connect a database, and open a project folder.</P><ol className="mb-3 list-decimal pl-5"><li>Download the installer for your OS from <a className="text-accent underline" href="/download">/download</a>.</li><li>Launch the app. On first run choose <b>Connect MySQL</b> or <b>Open Project</b>.</li><li>Open a query tab, write SQL and press <C>Ctrl+Enter</C>.</li></ol></> },
  { id: 'installation', title: 'Installation', body: <><P><b>Windows:</b> run the .exe installer (Windows 10/11), or unzip the portable build. <b>macOS 12+:</b> open the .dmg and drag the app to Applications. <b>Linux:</b> use the AppImage (<C>chmod +x</C> then run), or install the .deb / .rpm.</P><P>Verify downloads against the SHA-256 checksum shown on the download page.</P></> },
  { id: 'connect-mysql', title: 'Connect MySQL', body: <><P>Choose <b>Database → New connection</b>. Supported engines: MySQL, MariaDB, PostgreSQL, SQLite and SQL Server. Default MySQL port is <C>3306</C>.</P><P>Use <b>Test Connection</b> first, then <b>Connect</b> or <b>Save Connection</b>.</P></> },
  { id: 'create-connection', title: 'Create a Database Connection', body: <><P>Fields: name, group, environment, host, port, username, password, database, SSL, SSH tunnel and timeout. Groups such as LOCAL, DEVELOPMENT and PRODUCTION organize the tree. The environment adds a badge with text and a symbol so it never depends on color alone.</P><P>Passwords are saved in your operating system keychain, not in settings files, and never sent to the website.</P></> },
  { id: 'sql-editor', title: 'SQL Editor', body: <><P>The editor offers autocomplete for tables and columns from the connected database, formatting, folding, multi-cursor (<C>Alt+Click</C>), find and replace, go to line, go to symbol, minimap, word wrap, tabs and split view.</P><Pre>{`SELECT\n    id,\n    name,\n    email\nFROM users\nWHERE status = 'active'\nORDER BY created_at DESC;`}</Pre></> },
  { id: 'run-sql', title: 'Run SQL', body: <><P><C>Ctrl/Cmd+Enter</C> runs the selection (or everything), <C>Ctrl/Cmd+Shift+Enter</C> runs the statement at the cursor. <b>Cancel</b> stops a running query.</P><P>Before running, statements are parsed. SELECT runs immediately. <b>DROP, TRUNCATE, ALTER, DELETE without WHERE and UPDATE without WHERE</b> show “Potentially destructive operation” and need confirmation. On <b>PRODUCTION</b> connections every modifying statement asks first.</P></> },
  { id: 'history', title: 'Query History', body: <P>Each run is saved with its connection, database, duration and status, grouped by day. Re-run, edit, copy, delete or save a query for later from the History panel.</P> },
  { id: 'edit-data', title: 'Edit Data', body: <P>Double-click a table to open its data. Edit cells inline, add, duplicate or delete rows, then press <b>Save Changes</b>. You see a summary and the statements first, and everything runs in one transaction that rolls back on error. Tables without a primary key are read-only.</P> },
  { id: 'table-designer', title: 'Table Designer', body: <P>Right-click a database and choose <b>Create Table</b>. Add columns, indexes and foreign keys; the generated SQL (specific to your engine) updates live. Create the table, copy the SQL, or open it in an editor tab.</P> },
  { id: 'erd', title: 'ERD', body: <P>Right-click a database and choose <b>Show ERD</b>. Zoom with the wheel, drag to pan, search tables, and export as PNG or as SQL.</P> },
  { id: 'git', title: 'Git', body: <P>Git repositories are detected automatically. Stage, unstage, commit, create and switch branches, merge, rebase, stash, view diffs and history, pull, push and fetch. Clone with HTTPS or SSH. Authentication relies on your Git credential helper or SSH agent.</P> },
  { id: 'terminal', title: 'Terminal', body: <P>Windows: Git Bash, PowerShell, CMD. macOS/Linux: zsh, bash. Use <b>+</b> for a new tab, and Kill, Clear, Split and Maximize. Right-click a folder → <b>Open Terminal Here</b>. Toggle with <C>Ctrl/Cmd+J</C>.</P> },
  { id: 'projects', title: 'Projects', body: <><P>Open a folder to work with its files. Project types are detected: Laravel (<C>artisan</C> + <C>composer.json</C>), Django (<C>manage.py</C>), Node (<C>package.json</C>), Python and PHP. Matching commands appear as one-click buttons that run in the terminal where you can see them.</P></> },
  { id: 'settings', title: 'Settings', body: <P>Categories: Editor, Appearance, Terminal, Git, Database, Keyboard, Security, Downloads. The default editor font is JetBrains Mono, 14px, line height 1.5, dark theme. Zoom with <C>Ctrl+ +/−/0</C> or Ctrl + mouse wheel.</P> },
  { id: 'shortcuts', title: 'Keyboard Shortcuts', body: <table className="text-sm"><tbody>{SHORTCUTS.map(([k, d]) => <tr key={k} className="border-b border-line"><td className="py-1.5 pr-6"><kbd className="code">{k}</kbd></td><td>{d}</td></tr>)}</tbody></table> },
  { id: 'troubleshooting', title: 'Troubleshooting', body: <ul className="list-disc pl-5"><li><b>Access denied:</b> check username and password, and that the user may connect from your host.</li><li><b>Connection timed out:</b> verify host, port and firewall; raise the connection timeout.</li><li><b>SSL errors:</b> enable SSL only if the server supports it.</li><li><b>Terminal does not start:</b> install Git for Windows (Git Bash) or choose another shell in Settings → Terminal.</li><li><b>Large results feel slow:</b> lower the row limit in Settings → Database.</li></ul> },
]

export default function Docs() {
  usePageMeta('Documentation', 'Guides for connecting to MySQL, writing SQL, editing data, Git, the terminal and shortcuts.')
  const [id, setId] = useState(() => DOCS.find((d) => d.id === location.hash.slice(1))?.id ?? DOCS[0].id)
  const doc = DOCS.find((d) => d.id === id)!
  return (
    <>
      <H1>Documentation</H1>
      <Section className="grid gap-8 !pt-6 md:grid-cols-[220px_1fr]">
        <nav aria-label="Docs" className="flex gap-1 overflow-x-auto md:flex-col">
          {DOCS.map((d) => <a key={d.id} href={`#${d.id}`} onClick={() => setId(d.id)} className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${d.id === id ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'}`}>{d.title}</a>)}
        </nav>
        <article className="min-w-0 text-sm leading-relaxed"><h2 className="mb-4 text-2xl font-semibold">{doc.title}</h2>{doc.body}</article>
      </Section>
    </>
  )
}
