import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './pages/website/Layout'
import Home, { EditorPage, Features, MysqlTools } from './pages/website/Home'
import Download from './pages/website/Download'
import Docs from './pages/website/Docs'
import { Changelog, Github, Privacy, Releases, Terms } from './pages/website/Misc'

const IdeShell = lazy(() => import('./components/IdeShell'))

export default function App() {
  return (
    <Routes>
      <Route path="/app/*" element={<Suspense fallback={<div className="p-6 text-sm text-muted">Loading MySQL Forge Studio…</div>}><IdeShell /></Suspense>} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="features" element={<Features />} />
        <Route path="mysql" element={<MysqlTools />} />
        <Route path="editor" element={<EditorPage />} />
        <Route path="download" element={<Download />} />
        <Route path="docs" element={<Docs />} />
        <Route path="changelog" element={<Changelog />} />
        <Route path="releases" element={<Releases />} />
        <Route path="github" element={<Github />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<Terms />} />
        <Route path="*" element={<div className="p-16 text-center">Page not found.</div>} />
      </Route>
    </Routes>
  )
}
