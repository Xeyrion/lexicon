import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/inter'
import '@fontsource/gentium-plus/400.css'
import './index.css'
import ErrorBoundary from './components/ErrorBoundary'
import TabGate from './components/TabGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <TabGate />
    </ErrorBoundary>
  </StrictMode>,
)
