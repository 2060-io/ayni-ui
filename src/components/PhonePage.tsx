/**
 * The web fallback of an app link whose destination lives on the phone (UI-LINK-001, CC-WEB-002): the destination
 * named, the store pages when they exist. The link never acts.
 */
import { destinationKey } from '@ayni.org/ayni-ui-core'
import { ArrowLeft, Smartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'

export function PhonePage() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const key = snap.phoneFor ? destinationKey(snap.phoneFor) : 'unknown'
  const destination = t(`link.destination.${key}`, { defaultValue: t('link.destination.unknown') })
  const stores = [
    snap.config.appStoreUrl ? { href: snap.config.appStoreUrl, label: t('link.appStore') } : null,
    snap.config.playStoreUrl ? { href: snap.config.playStoreUrl, label: t('link.playStore') } : null,
  ].filter((s): s is { href: string; label: string } => !!s)
  return (
    <div className="panel phone-page" data-destination={key}>
      <button type="button" className="btn small back" onClick={() => hub.setView('list')}>
        <ArrowLeft size={16} aria-hidden="true" /> {t('link.back')}
      </button>
      <h1 className="row-between" style={{ justifyContent: 'flex-start', gap: 8 }}>
        <Smartphone size={20} aria-hidden="true" /> {t('link.title')}
      </h1>
      <p>{t('link.onPhone', { destination })}</p>
      {stores.length ? (
        <p className="muted">
          {t('link.getApp')}{' '}
          {stores.map((s) => (
            <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" style={{ marginRight: 12 }}>
              {s.label}
            </a>
          ))}
        </p>
      ) : null}
    </div>
  )
}
