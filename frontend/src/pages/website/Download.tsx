import DownloadSection, { useReleases } from './DownloadSection'
import { usePageMeta } from './Layout'

export { useReleases }

/** Stand-alone /download page: the same section as on the landing page (anchors #download-windows / -macos / -linux work on both). */
export default function Download() {
  usePageMeta('Download', 'Download MySQL Forge Studio for Windows, macOS and Linux.')
  return <DownloadSection standalone />
}
