import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTextSize } from './app/textSize'

// El tamaño de letra elegido en este móvil, antes de pintar nada.
applyTextSize()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// La pantalla de bienvenida (index.html) se ve al menos 1,3 s desde que se abre la app y luego se funde con la primera pantalla.
const splash = document.getElementById('splash')
if (splash) {
  setTimeout(
    () => {
      splash.classList.add('hide')
      document.body.style.removeProperty('background')
      setTimeout(() => splash.remove(), 600)
    },
    Math.max(0, 1300 - performance.now()),
  )
}
