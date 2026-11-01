import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/theme/global.css'
import './ui/theme/print.css'
import { App } from './ui/app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
