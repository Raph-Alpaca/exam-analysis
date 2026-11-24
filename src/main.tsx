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

// 글꼴은 첫 화면을 막지 않도록 따로 불러온다 (ui/theme/fonts.ts 참고).
// 받지 못해도 대체 글꼴(맑은 고딕 등)로 그대로 쓸 수 있으므로 오류로 다루지 않는다.
void import('./ui/theme/fonts').catch(() => {})
