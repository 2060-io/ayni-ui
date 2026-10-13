import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { initI18n } from './i18n/index.js'
import { applyBrand } from './state/config.js'
import { Hub } from './state/hub.js'
import './styles/app.css'

async function boot(): Promise<void> {
  const hub = await Hub.create()
  const snapshot = hub.getSnapshot()
  applyBrand(snapshot.brand)
  const lng = initI18n(
    snapshot.config.locales,
    snapshot.prefs.locale,
    snapshot.config.defaultLocale ?? snapshot.brand.defaultLocale
  )
  document.documentElement.lang = lng
  const root = document.getElementById('root')
  if (!root) throw new Error('no root')
  createRoot(root).render(
    <StrictMode>
      <App hub={hub} />
    </StrictMode>
  )
  // offline shell (UI-PLAT-001); registration is explicit so that no push subscription ever exists (UI-PLAT-002)
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const { registerSW } = await import('virtual:pwa-register')
    registerSW({ immediate: true })
  }
}

void boot()
