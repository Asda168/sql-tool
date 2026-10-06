import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { LogoFull } from '../../components/Logo'

export const REPO = 'https://github.com/Asda168/sql-tool'
export const SEO_TITLE = 'MySQL Forge Studio - Modern MySQL Database Client'
export const SEO_DESC = 'MySQL Forge Studio is a modern MySQL database client, SQL editor, code editor, Git client and terminal for Windows, macOS and Linux.'

export function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} | MySQL Forge Studio` : SEO_TITLE
    document.querySelector('meta[name="description"]')?.setAttribute('content', description ?? SEO_DESC)
    document.documentElement.dataset.theme = document.documentElement.dataset.theme || 'dark'
  }, [title, description])
}

const NAV = [['/features', 'Features'], ['/mysql', 'MySQL'], ['/editor', 'Editor'], ['/download', 'Download'], ['/docs', 'Docs'], ['/changelog', 'Changelog']] as const

export default function Layout() {
  const [open, setOpen] = useState(false)
  useEffect(() => { document.documentElement.dataset.theme = 'dark' }, [])
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/" aria-label="MySQL Forge Studio home"><LogoFull className="text-sm" /></Link>
          <nav className="hidden flex-1 gap-5 text-sm md:flex" aria-label="Main">
            {NAV.map(([to, l]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'text-accent' : 'text-muted hover:text-fg')}>{l}</NavLink>)}
          </nav>
          <div className="hidden gap-2 md:flex">
            <a className="btn" href={REPO} target="_blank" rel="noreferrer">GitHub</a>
            <Link className="btn btn-primary" to="/download">Download</Link>
            <Link className="btn" to="/app">Open app</Link>
          </div>
          <button className="ml-auto md:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        </div>
        {open && <nav className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm md:hidden" onClick={() => setOpen(false)}>{NAV.map(([to, l]) => <Link key={to} to={to}>{l}</Link>)}<Link to="/app">Open app</Link></nav>}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-line py-10 text-sm text-muted">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-4">
          <div className="sm:col-span-2"><LogoFull className="text-sm text-fg" /><p className="mt-2 max-w-sm">Write SQL. Manage Code. Connect. Build.</p></div>
          <div className="flex flex-col gap-1.5"><b className="text-fg">Product</b><Link to="/features">Features</Link><Link to="/download">Download</Link><Link to="/releases">Releases</Link><Link to="/changelog">Changelog</Link></div>
          <div className="flex flex-col gap-1.5"><b className="text-fg">Resources</b><Link to="/docs">Documentation</Link><Link to="/github">GitHub</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div>
        </div>
        <p className="mx-auto mt-8 max-w-6xl px-4 text-xs">© {new Date().getFullYear()} MySQL Forge Studio. Not affiliated with Oracle or Beekeeper Studio. MySQL is a trademark of Oracle.</p>
      </footer>
    </div>
  )
}

export function Section({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`mx-auto max-w-6xl px-4 py-14 ${className}`}>{children}</section>
}
export function H1({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 pb-4 pt-16 text-center"><h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{children}</h1>{sub && <p className="mt-4 text-lg text-muted">{sub}</p>}</div>
}
