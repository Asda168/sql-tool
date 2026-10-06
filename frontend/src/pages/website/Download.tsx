import { useEffect, useState } from 'react'
import { Download as DlIcon, Monitor } from 'lucide-react'
import { api, type Release } from '../../lib/api'
import { PLATFORM_LABEL, detectPlatform, formatBytes, type Platform } from '../../lib/os'
import { H1, REPO, Section, usePageMeta } from './Layout'

const PKG_LABEL: Record<string, string> = { exe: '.exe installer', portable: 'Portable (.zip)', dmg: '.dmg', appimage: 'AppImage', deb: '.deb', rpm: '.rpm' }
const PLATFORMS: Platform[] = ['windows', 'macos', 'linux']
const REQS = ['Windows 10/11', 'macOS 12+', 'Ubuntu 22.04+', 'Linux x64', 'Linux ARM64']

export function useReleases() {
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { api.latestReleases().then(setReleases, () => { setFailed(true); setReleases([]) }) }, [])
  return { releases, failed }
}

export default function Download() {
  usePageMeta('Download', 'Download MySQL Forge Studio for Windows, macOS and Linux.')
  const { releases, failed } = useReleases()
  const [os, setOs] = useState<Platform | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => setOs(detectPlatform()), [])
  const list = releases ?? []
  const version = list[0]?.version ?? '1.0.0'
  const published = list[0]?.published_at ? new Date(list[0].published_at).toLocaleDateString() : '—'

  const download = async (r: Release) => {
    setMsg('')
    try {
      const rec = await api.requestDownload(r.platform, r.architecture, r.package_type) // creates the Download record
      window.location.href = rec.download_url
    } catch { window.location.href = r.download_url } // never block the download if tracking fails
    setMsg(`Starting download of ${r.version} (${r.architecture}). After installing, launch MySQL Forge Studio and choose “Connect MySQL” or “Open Local Project”.`)
  }
  const primary = (p: Platform) => list.find((r) => r.platform === p && r.architecture === (p === 'macos' ? 'arm64' : 'x64') && ['exe', 'dmg', 'appimage'].includes(r.package_type)) ?? list.find((r) => r.platform === p)

  return (
    <>
      <H1 sub="Your modern MySQL development environment.">MySQL Forge Studio</H1>
      <p className="mx-auto max-w-2xl px-4 text-center text-sm text-muted">A modern MySQL database manager and developer workspace for developers who want database tools, code editing, Git, and terminal workflows in one place.</p>
      <Section>
        {os && <p className="mb-4 text-center text-sm" aria-live="polite"><Monitor className="mr-1 inline" size={14} />You’re using <b>{PLATFORM_LABEL[os]}</b></p>}
        {os && primary(os) && <div className="mb-8 text-center"><button className="btn btn-primary !px-6 !py-3 text-base" onClick={() => download(primary(os)!)}><DlIcon size={16} />Download for {PLATFORM_LABEL[os]}</button></div>}
        {msg && <p role="status" className="mx-auto mb-6 max-w-xl rounded-lg border border-ok/40 p-3 text-center text-sm">{msg}</p>}
        {releases && !list.length && (
          <div className="mx-auto mb-8 max-w-xl rounded-xl border border-warn/40 bg-warn/10 p-4 text-center text-sm">
            {failed ? 'The release service is unreachable right now.' : 'No release has been published yet.'} Installers will appear here after the first build. In the meantime, <a className="underline" href={`${REPO}/releases`} target="_blank" rel="noreferrer">check GitHub Releases</a> or <a className="underline" href="/app">try the app in your browser</a>.
          </div>
        )}
        <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wider text-muted">{os ? 'Other downloads' : 'Choose your platform'}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PLATFORMS.map((p) => {
            const rs = list.filter((r) => r.platform === p)
            return (
              <div key={p} className={`rounded-xl border bg-panel p-5 ${p === os ? 'border-accent' : 'border-line'}`}>
                <h3 className="text-lg font-semibold">{PLATFORM_LABEL[p]}</h3>
                <p className="mb-3 text-xs text-muted">{p === 'windows' ? '.exe' : p === 'macos' ? '.dmg' : 'AppImage / .deb / .rpm'}</p>
                <div className="space-y-2">
                  {rs.map((r) => <button key={r.id} className="btn w-full justify-between" onClick={() => download(r)}><span>{PKG_LABEL[r.package_type]} · {r.architecture}</span><span className="text-muted">{formatBytes(r.file_size)}</span></button>)}
                  {!rs.length && <button className="btn w-full justify-center" disabled>Download</button>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel p-5 text-sm"><h3 className="mb-2 font-semibold">MySQL Forge Studio v{version}</h3><dl className="grid grid-cols-[110px_1fr] gap-y-1"><dt className="text-muted">Latest version</dt><dd>{version}</dd><dt className="text-muted">Release date</dt><dd>{published}</dd></dl>
            <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-muted">System requirements</h4><ul className="list-disc pl-5 text-muted">{REQS.map((r) => <li key={r}>{r}</li>)}</ul></div>
          <div className="rounded-xl border border-line bg-panel p-5 text-sm"><h3 className="mb-2 font-semibold">SHA-256 checksums</h3>
            {list.length ? <ul className="space-y-2">{list.map((r) => <li key={r.id}><div className="text-xs text-muted">{PLATFORM_LABEL[r.platform]} {r.architecture} · {PKG_LABEL[r.package_type]}</div><code className="code break-all text-[11px]">{/^0+$/.test(r.checksum) ? 'pending: published with the first signed build' : r.checksum}</code></li>)}</ul> : <p className="text-muted">Checksums are listed here for every published file. Verify with <code className="code">certutil -hashfile file SHA256</code> (Windows) or <code className="code">shasum -a 256 file</code>.</p>}</div>
        </div>
      </Section>
    </>
  )
}
