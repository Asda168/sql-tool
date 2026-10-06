import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { isTauri } from './bridge'
import './index.css'

// Inside the desktop app there is no website: boot straight into the IDE.
if (isTauri() && !location.pathname.startsWith('/app')) history.replaceState(null, '', '/app')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
