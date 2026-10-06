import { Link } from 'react-router-dom'
import { formatBytes, PLATFORM_LABEL } from '../../lib/os'
import { H1, REPO, Section, usePageMeta } from './Layout'
import { useReleases } from './Download'

export function Changelog() {
  usePageMeta('Changelog', 'What changed in each MySQL Forge Studio release.')
  return (<><H1>Changelog</H1><Section className="mx-auto max-w-3xl !pt-4 text-sm">
    <h2 className="text-xl font-semibold">v1.0.0</h2>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-muted"><li>MySQL, MariaDB, PostgreSQL, SQLite and SQL Server connections with keychain-stored credentials.</li><li>SQL editor with schema-aware autocomplete, safety confirmation and query history.</li><li>Spreadsheet-style data editor with transactional saves.</li><li>Table designer and ERD.</li><li>Project explorer, Git panel and integrated terminal.</li><li>Download center and documentation.</li></ul></Section></>)
}

export function Releases() {
  usePageMeta('Releases', 'All published MySQL Forge Studio releases and checksums.')
  const { releases } = useReleases()
  return (<><H1>Release history</H1><Section className="!pt-4"><div className="overflow-x-auto rounded-xl border border-line"><table className="w-full text-left text-sm"><thead className="bg-raised text-muted"><tr>{['Version', 'Platform', 'Arch', 'Package', 'Size', 'Published'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead><tbody>
    {(releases ?? []).map((r) => <tr key={r.id} className="border-t border-line"><td className="px-3 py-2">{r.version}{r.is_latest && <span className="ml-2 rounded border border-accent/50 px-1 text-[10px] text-accent">latest</span>}</td><td className="px-3">{PLATFORM_LABEL[r.platform]}</td><td className="px-3">{r.architecture}</td><td className="px-3">{r.package_type}</td><td className="px-3">{formatBytes(r.file_size)}</td><td className="px-3">{new Date(r.published_at).toLocaleDateString()}</td></tr>)}
    {releases && !releases.length && <tr><td className="px-3 py-6 text-center text-muted" colSpan={6}>No releases published yet. See <a className="text-accent underline" href={`${REPO}/releases`}>GitHub Releases</a>.</td></tr>}</tbody></table></div></Section></>)
}

export function Github() {
  usePageMeta('GitHub', 'Source code and issue tracker for MySQL Forge Studio.')
  return (<><H1 sub="Source code, issues and releases.">Open source</H1><Section className="text-center"><a className="btn btn-primary !px-5 !py-2.5" href={REPO} target="_blank" rel="noreferrer">View on GitHub</a> <a className="btn !px-5 !py-2.5" href={`${REPO}/issues`} target="_blank" rel="noreferrer">Report an issue</a></Section></>)
}

const Legal = ({ title, children }: { title: string; children: React.ReactNode }) => { usePageMeta(title); return (<><H1>{title}</H1><Section className="mx-auto max-w-3xl space-y-3 !pt-4 text-sm text-muted">{children}<p className="text-xs">This text is a starting template, not legal advice. Have it reviewed before publishing.</p></Section></>) }

export const Privacy = () => (
  <Legal title="Privacy Policy">
    <p><b className="text-fg">Your data stays on your computer.</b> Database connections, passwords, queries, files and Git repositories are handled by the desktop app locally. Passwords go to your operating system keychain.</p>
    <p><b className="text-fg">What our servers store:</b> optional account details (username, email), editor preferences you choose to sync, and release download records (a salted hash of your IP address and your browser’s user agent, used for download counts).</p>
    <p><b className="text-fg">What we never do:</b> read your query results, schema row data, files or Git contents, or run commands on your machine from the website.</p>
    <p>Contact: open an issue on <Link className="text-accent underline" to="/github">GitHub</Link>.</p>
  </Legal>
)

export const Terms = () => (
  <Legal title="Terms of Use">
    <p>MySQL Forge Studio is provided “as is”, without warranty. You are responsible for the SQL you run and the databases you connect to. Always keep backups before running destructive statements, especially on production systems.</p>
    <p>The software is not affiliated with or endorsed by Oracle Corporation. MySQL is a trademark of Oracle.</p>
  </Legal>
)
