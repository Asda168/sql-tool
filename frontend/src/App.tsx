import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './pages/website/Layout'
import Home from './pages/website/Home'
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
        <Route path="features" element={<Navigate to="/#features" replace />} />
        <Route path="mysql" element={<Navigate to="/#engines" replace />} />
        <Route path="editor" element={<Navigate to="/#snippets" replace />} />
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
