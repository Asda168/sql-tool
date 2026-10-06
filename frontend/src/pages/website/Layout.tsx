import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ArrowUp, Menu, X } from 'lucide-react'
import { LogoFull } from '../../components/Logo'

export const REPO = 'https://github.com/Asda168/sql-tool'
export const SEO_TITLE = 'MySQL Forge Studio - Modern MySQL Database Client'
export const SEO_DESC = 'MySQL Forge Studio is a modern MySQL database client, SQL editor, code editor, Git client and terminal for Windows, macOS and Linux.'

export function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} | MySQL Forge Studio` : SEO_TITLE
    document.querySelector('meta[name="description"]')?.setAttribute('content', description ?? SEO_DESC)
  }, [title, description])
}

/** In-page sections of the landing page. Links work from any page (router navigation + hash scroll). */
export const SECTIONS = [
  ['features', 'Features'], ['engines', 'Engines'], ['snippets', 'Snippets'], ['workflows', 'Workflows'], ['download', 'Download'], ['source', 'Build from source'],
] as const

function useScrollToHash() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) { window.scrollTo({ top: 0 }); return }
    // wait a tick so lazily rendered sections exist
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 50)
    return () => clearTimeout(t)
  }, [pathname, hash])
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useScrollToHash()
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
    const h = () => setScrolled(window.scrollY > 8)
    h(); window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])
  const link = (hash: string, label: string) => <Link key={hash} to={{ pathname: '/', hash: `#${hash}` }} className="text-sm text-muted transition hover:text-fg" onClick={() => setOpen(false)}>{label}</Link>

  return (
    <div className="site flex min-h-screen flex-col font-sans">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-1.5 focus:text-ink">Skip to content</a>
      <header className={`fixed inset-x-0 top-0 z-40 transition ${scrolled || open ? 'border-b border-white/10 bg-ink/80 backdrop-blur-xl' : 'border-b border-transparent'}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-5">
          <Link to="/" aria-label="MySQL Forge Studio home"><LogoFull className="text-sm" /></Link>
          <nav className="hidden flex-1 items-center gap-6 lg:flex" aria-label="Main">{SECTIONS.map(([h, l]) => link(h, l))}<Link to="/docs" className="text-sm text-muted transition hover:text-fg">Docs</Link></nav>
          <div className="ml-auto hidden items-center gap-2 lg:flex">
            <a className="btn-ghost !py-2" href={REPO} target="_blank" rel="noreferrer">GitHub</a>
            <Link className="btn-neon !py-2" to={{ pathname: '/', hash: '#download' }}>Download</Link>
          </div>
          <button className="ml-auto lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        </div>
        {open && (
          <nav className="flex flex-col gap-4 border-t border-white/10 px-5 py-4 lg:hidden" aria-label="Mobile">
            {SECTIONS.map(([h, l]) => link(h, l))}
            <Link to="/docs" className="text-sm text-muted" onClick={() => setOpen(false)}>Docs</Link>
            <Link className="btn-neon" to={{ pathname: '/', hash: '#download' }} onClick={() => setOpen(false)}>Download</Link>
          </nav>
        )}
      </header>

      <main id="main" className="flex-1"><Outlet /></main>

      <footer className="border-t border-white/10 py-8 text-sm text-muted">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5">
          <span>© {new Date().getFullYear()} MySQL Forge Studio</span>
          <a className="hover:text-fg" href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a className="hover:text-fg" href={`${REPO}/issues`} target="_blank" rel="noreferrer">Issues</a>
          <Link className="hover:text-fg" to="/docs">Docs</Link>
          <Link className="hover:text-fg" to="/changelog">Changelog</Link>
          <Link className="hover:text-fg" to="/privacy">Privacy</Link>
          <Link className="hover:text-fg" to="/terms">Terms</Link>
          <a className="ml-auto inline-flex items-center gap-1 hover:text-fg" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Top <ArrowUp size={14} /></a>
        </div>
        <p className="mx-auto mt-4 max-w-6xl px-5 text-xs text-muted/70">Not affiliated with Oracle or Beekeeper Studio. MySQL is a trademark of Oracle.</p>
      </footer>
    </div>
  )
}

export function Section({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return <section id={id} className={`mx-auto max-w-6xl px-5 py-20 ${className}`}>{children}</section>
}

export function SectionHead({ eyebrow, title, sub, center = false }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={`mb-10 ${center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}`}>
      {eyebrow && <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-accent">{eyebrow}</div>}
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-base text-muted">{sub}</p>}
    </div>
  )
}

/** Page header for the secondary pages (docs, changelog, …): same look as the landing page. */
export function H1({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return <div className="relative mx-auto max-w-3xl px-5 pb-6 pt-32 text-center"><h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{children}</h1>{sub && <p className="mt-4 text-lg text-muted">{sub}</p>}</div>
}
