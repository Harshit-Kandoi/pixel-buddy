import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// The main process mirrors the layout when the buddy is on the left or top half of the screen.
const applySide = ({ buddyOnLeft, buddyOnTop }: { buddyOnLeft: boolean; buddyOnTop: boolean }): void => {
  document.documentElement.classList.toggle('buddy-left', buddyOnLeft)
  document.documentElement.classList.toggle('buddy-top', buddyOnTop)
}
void window.api.getSettings().then(applySide)
window.api.onSettingsUpdated(applySide)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
