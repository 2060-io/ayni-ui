/** A new version waits (UI-PLAT-007): said across the top of the shell until the person presses Reload. */
import { useTranslation } from 'react-i18next'
import { type AppUpdate, useNewVersion } from '../state/update.js'

export function UpdateBanner({ update }: { update: AppUpdate }) {
  const { t } = useTranslation()
  const waiting = useNewVersion(update)
  if (!waiting) return null
  return (
    <div className="banner info update-banner" role="status">
      <span>{t('update.available')}</span>
      <button type="button" className="btn small primary" onClick={() => void update.reload()}>
        {t('update.reload')}
      </button>
    </div>
  )
}
