import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import es from './es.json'
import fr from './fr.json'
import pt from './pt.json'

export const LOCALES: Record<string, { label: string; resources: Record<string, unknown> }> = {
  en: { label: 'English', resources: en },
  es: { label: 'Español', resources: es },
  fr: { label: 'Français', resources: fr },
  pt: { label: 'Português', resources: pt },
}

/** Presentation language: the person's choice, the browser locale by default (UI-I18N-001/003). */
export function initI18n(offered: string[], preferred?: string, fallback?: string): string {
  const available = offered.filter((l) => LOCALES[l])
  const browser = navigator.language.slice(0, 2)
  const lng =
    preferred && available.includes(preferred)
      ? preferred
      : available.includes(browser)
        ? browser
        : (fallback ?? available[0] ?? 'en')
  void i18next.use(initReactI18next).init({
    lng,
    fallbackLng: 'en',
    resources: Object.fromEntries(Object.entries(LOCALES).map(([k, v]) => [k, { translation: v.resources }])),
    interpolation: { escapeValue: false },
  })
  return lng
}

/** The time on a message and on a conversation row: the rule of the core, shared with the Ayni app. */
export { formatTime } from '@ayni.org/ayni-ui-core'

export default i18next
