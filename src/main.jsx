import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Admin from './Admin.jsx'
import { Analytics } from '@vercel/analytics/react'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <>{window.location.pathname === "/admin" ? <Admin /> : <App />}<Analytics /></>
  </StrictMode>,
)
