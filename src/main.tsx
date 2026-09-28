import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

if (import.meta.env.DEV) {
  const axe = await import('@axe-core/react')
  const React = await import('react')
  const ReactDOM = await import('react-dom')
  axe.default(React.default, ReactDOM.default, 1000)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
