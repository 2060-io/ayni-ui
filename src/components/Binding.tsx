/** Link your phone (D8, D9; UI-BIND-002..008): QR, binding code, wallet link on mobile, refresh after expiry. */
import type { SessionRecord } from '@2060.io/hologram-ui-core'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub } from '../state/useHub.js'

const isMobile = () => /Android|iPhone|iPad/.test(navigator.userAgent)

export function Binding({ session }: { session: SessionRecord }) {
  const { t } = useTranslation()
  const hub = useHub()
  const [qr, setQr] = useState<string>('')
  const [now, setNow] = useState(Date.now())
  const binding = session.binding
  useEffect(() => {
    if (!binding) return
    // the invitation is rendered only, never parsed or stored beyond the opaque string (UI-BIND-008)
    QRCode.toDataURL(binding.oobUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(setQr, () => setQr(''))
  }, [binding])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  if (!binding) return null
  const left = Math.max(0, Math.round((Date.parse(binding.expiresAt) - now) / 1000))
  const expired = left === 0
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <h1>{t('bind.title')}</h1>
      <p>{t('bind.scan')}</p>
      {!expired ? (
        <>
          {qr ? (
            <div className="qr">
              <img src={qr} alt="QR" width={240} height={240} />
            </div>
          ) : null}
          <div style={{ marginTop: 14 }}>
            <div className="muted">{t('bind.code')}</div>
            <div className="code" aria-live="polite">
              {binding.bindingCode}
            </div>
            <div className="muted">{t('bind.codeHint')}</div>
            <div className="muted" style={{ marginTop: 6 }}>
              {t('bind.manual')}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t('bind.expiresIn', { seconds: left })}
            </div>
          </div>
          {isMobile() ? (
            <a className="btn primary" style={{ marginTop: 14 }} href={binding.walletLink} rel="noopener noreferrer">
              {t('bind.openApp')}
            </a>
          ) : null}
          <p className="muted progress" style={{ justifyContent: 'center', marginTop: 12 }}>
            {t('bind.waiting')}
          </p>
        </>
      ) : (
        <>
          <p className="muted">{t('bind.expired')}</p>
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              void hub.refreshBinding(session.sessionId).catch((e) => hub.notify('error', String(e.message ?? e)))
            }
          >
            {t('bind.newCode')}
          </button>
        </>
      )}
    </div>
  )
}
