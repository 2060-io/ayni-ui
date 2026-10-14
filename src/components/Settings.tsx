/** Language, theme, sounds, install, about (UI-I18N-001, UI-THEME-003, UI-PLAT-005). */

import { PROFILE_VERSION } from '@2060.io/hologram-agui-profile'
import { ArrowLeft, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18next, { LOCALES } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
}

let deferredInstall: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredInstall = e as BeforeInstallPromptEvent
  })
}

export function Settings() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const [canInstall, setCanInstall] = useState(!!deferredInstall)
  useEffect(() => {
    const onPrompt = () => setCanInstall(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])
  const installed = window.matchMedia('(display-mode: standalone)').matches
  return (
    <div className="panel">
      <button type="button" className="btn small back" onClick={() => hub.setView('list')}>
        <ArrowLeft size={16} /> {t('app.back')}
      </button>
      <div className="row-between">
        <h1>{t('settings.title')}</h1>
        <button type="button" className="icon-btn" aria-label={t('app.close')} onClick={() => hub.setView('list')}>
          <X size={20} />
        </button>
      </div>
      <label className="field">
        {t('settings.language')}
        <select
          className="input"
          value={i18next.language}
          onChange={(e) => {
            void i18next.changeLanguage(e.target.value)
            document.documentElement.lang = e.target.value
            void hub.setPreferences({ locale: e.target.value })
          }}
        >
          {snap.config.locales
            .filter((l) => LOCALES[l])
            .map((l) => (
              <option key={l} value={l}>
                {LOCALES[l].label}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        {t('settings.theme')}
        <select
          className="input"
          value={snap.prefs.theme}
          onChange={(e) => void hub.setPreferences({ theme: e.target.value as 'system' | 'light' | 'dark' })}
        >
          <option value="system">{t('settings.themeSystem')}</option>
          <option value="light">{t('settings.themeLight')}</option>
          <option value="dark">{t('settings.themeDark')}</option>
        </select>
      </label>
      {snap.config.soundsEnabled ? (
        <label className="field" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={snap.prefs.sounds}
            onChange={(e) => void hub.setPreferences({ sounds: e.target.checked })}
          />{' '}
          {t('settings.sounds')}
        </label>
      ) : null}
      {snap.config.installPromptEnabled && !installed ? (
        <div className="field">
          {canInstall && deferredInstall ? (
            <button type="button" className="btn" onClick={() => void deferredInstall?.prompt()}>
              {t('app.install')}
            </button>
          ) : (
            <span className="muted">{t('app.installHint')}</span>
          )}
        </div>
      ) : null}
      <h3>{t('settings.about')}</h3>
      <div className="muted">{t('settings.version', { version: __APP_VERSION__ })}</div>
      <div className="muted">{t('settings.profile', { version: PROFILE_VERSION })}</div>
      <div className="column-actions">
        {snap.brand.links?.terms ? (
          <a href={snap.brand.links.terms} target="_blank" rel="noopener noreferrer">
            {t('settings.links.terms')}
          </a>
        ) : null}
        {snap.brand.links?.privacy ? (
          <a href={snap.brand.links.privacy} target="_blank" rel="noopener noreferrer">
            {t('settings.links.privacy')}
          </a>
        ) : null}
        {snap.brand.links?.support ? (
          <a href={snap.brand.links.support} target="_blank" rel="noopener noreferrer">
            {t('settings.links.support')}
          </a>
        ) : null}
      </div>
    </div>
  )
}
