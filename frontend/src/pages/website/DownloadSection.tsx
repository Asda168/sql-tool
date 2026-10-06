import { useEffect, useState } from 'react'
import { Apple, Check, Copy, Download as DlIcon, Monitor, Terminal } from 'lucide-react'
import { api, type Release } from '../../lib/api'
import { PLATFORM_LABEL, detectPlatform, formatBytes, type Platform } from '../../lib/os'
import { REPO, Section, SectionHead } from './Layout'

const PKG: Record<string, string> = { exe: 'Installer (.exe)', portable: 'Portable (.zip)', dmg: 'Disk image (.dmg)', appimage: 'AppImage', deb: '.deb package', rpm: '.rpm package' }

const BLOCKS: { id: Platform; title: string; reqs: string; icon: typeof Monitor; steps: string[] }[] = [
  { id: 'windows', title: 'MySQL Forge Studio for Windows', reqs: 'Windows 10/11 · x64', icon: Monitor, steps: ['Install Node.js 20+ from nodejs.org (one time).', 'Download the setup file below and double-click it. No administrator rights are needed; run it again any time to update.', 'Launch MySQL Forge Studio from the Desktop or Start menu shortcut, then choose “Connect Database” or “Open Project”.'] },
  { id: 'macos', title: 'MySQL Forge Studio for macOS', reqs: 'macOS 12+ · Apple silicon & Intel', icon: Apple, steps: ['Open the .dmg and drag the app into Applications.', 'First launch: right-click the app and choose Open (the build is not notarized yet).', 'Choose “Connect Database” or “Open Project”.'] },
  { id: 'linux', title: 'MySQL Forge Studio for Linux', reqs: 'Ubuntu 22.04+, Fedora 38+ · x64 & ARM64', icon: Terminal, steps: ['AppImage: chmod +x the file and run it. Or install the .deb / .rpm.', 'Needs webkit2gtk-4.1 and libsecret (installed by the .deb/.rpm).', 'Choose “Connect Database” or “Open Project”.'] },
]

const FALLBACK_NOTES = ['Five database engines: MySQL, MariaDB, PostgreSQL, SQLite and SQL Server', 'Schema-aware autocomplete with foreign-key JOIN hints and snippets', 'Edit Data mode with transactional saves', 'Laragon, WAMP and XAMPP detection', 'Integrated terminal and Git']

export function useReleases() {
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { api.latestReleases().then(setReleases, () => { setFailed(true); setReleases([]) }) }, [])
  return { releases, failed }
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return <button className="absolute right-2 top-2 rounded border border-white/10 bg-white/5 p-1.5 text-white/60 transition hover:text-white" aria-label="Copy" onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }}>{done ? <Check size={13} /> : <Copy size={13} />}</button>
}

export default function DownloadSection({ standalone = false }: { standalone?: boolean }) {
  const { releases } = useReleases()
  const [os, setOs] = useState<Platform | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => setOs(detectPlatform()), [])
  const list = releases ?? []
  const first = list[0]
  const version = first?.version ?? '1.0.0'
  const date = first ? new Date(first.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null
  const notes = (first?.release_notes?.split(/\r?\n/).map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean) ?? []).slice(0, 6)

  const download = async (r: Release) => {
    setMsg('')
    try { const rec = await api.requestDownload(r.platform, r.architecture, r.package_type); window.location.href = rec.download_url } // creates the Download record
    catch { window.location.href = r.download_url } // never block the download if tracking fails
    setMsg(`Starting download of v${r.version} (${PLATFORM_LABEL[r.platform]} ${r.architecture}). After installing, launch the app and choose “Connect Database” or “Open Project”.`)
  }

  return (
    <Section id={standalone ? undefined : 'download'} className={standalone ? '!pt-32' : ''}>
      <SectionHead eyebrow="Download" title="Download MySQL Forge Studio" sub="Free for Windows, macOS and Linux. Your databases, files and Git stay on your machine." />
      <div className="card mb-8 !p-6">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1"><h3 className="text-lg font-semibold">Version {version}</h3><span className="text-sm text-muted">{date ? `Released ${date}` : 'First public release'}</span>{os && <span className="rounded-full border border-accent/40 px-2.5 py-0.5 text-xs text-accent">You’re using {PLATFORM_LABEL[os]}</span>}</div>
        <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-widest text-muted">What’s new in v{version}</h4>
        <ul className="grid gap-x-8 gap-y-1.5 text-sm text-muted sm:grid-cols-2">{(notes.length ? notes : FALLBACK_NOTES).map((n) => <li key={n} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-mint" />{n}</li>)}</ul>
      </div>
      {msg && <p role="status" className="mb-6 rounded-lg border border-mint/40 bg-mint/10 p-3 text-sm">{msg}</p>}
      {releases && !list.length && (
        <p className="mb-6 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">Installers aren’t published here yet. In the meantime you can <a className="underline" href={`${REPO}/releases`} target="_blank" rel="noreferrer">check GitHub Releases</a> or <a className="underline" href="#source">run it from source</a>.</p>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {BLOCKS.map((b) => {
          const rs = list.filter((r) => r.platform === b.id)
          const mine = os === b.id
          return (
            <article key={b.id} id={`download-${b.id}`} className={`card scroll-mt-24 flex flex-col ${mine ? '!border-accent/60 glow-cyan' : ''}`}>
              <div className="flex items-center gap-3"><b.icon className="text-accent" size={22} /><h3 className="font-semibold leading-tight">{b.title}</h3></div>
              <p className="mt-1 text-xs text-muted">{b.reqs}</p>
              {mine && <span className="mt-2 w-fit rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">Recommended for your system</span>}
              <ol className="my-4 list-decimal space-y-1.5 pl-5 text-sm text-muted">{b.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              <div className="mt-auto space-y-2">
                {b.id === 'windows' && <a className={mine ? 'btn-neon w-full' : 'btn-ghost w-full'} href="/install-forge-studio.cmd" download><DlIcon size={15} />Windows setup (.cmd)</a>}
                {rs.map((r) => <button key={r.id} className={mine && ['exe', 'dmg', 'appimage'].includes(r.package_type) ? 'btn-neon w-full' : 'btn-ghost w-full justify-between'} onClick={() => download(r)}><span className="inline-flex items-center gap-2"><DlIcon size={15} />{PKG[r.package_type]} · {r.architecture}</span><span className="text-xs opacity-70">{formatBytes(r.file_size)}</span></button>)}
                {!rs.length && <button className="btn-ghost w-full" disabled><DlIcon size={15} />Coming soon</button>}
              </div>
            </article>
          )
        })}
      </div>

      {list.length > 0 && (
        <details className="card mt-6 text-sm">
          <summary className="cursor-pointer font-medium">SHA-256 checksums</summary>
          <ul className="mt-3 space-y-2">{list.map((r) => <li key={r.id}><div className="text-xs text-muted">{PLATFORM_LABEL[r.platform]} {r.architecture} · {PKG[r.package_type]}</div><code className="code break-all text-[11px]">{/^0+$/.test(r.checksum) ? 'pending: published with the first signed build' : r.checksum}</code></li>)}</ul>
          <p className="mt-3 text-xs text-muted">Verify with <code className="code">certutil -hashfile file SHA256</code> (Windows) or <code className="code">shasum -a 256 file</code>.</p>
        </details>
      )}
    </Section>
  )
}

export { CopyBtn }
