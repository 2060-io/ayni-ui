/**
 * `/app/connect?oob=` opened in a browser (CC-WEB-002): the invitation as a QR for other wallets, nothing more.
 * On a phone with the Ayni app the same link opens the app instead.
 */
import { ArrowLeft } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'

export function ConnectPage() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const [qr, setQr] = useState('')
  const oob = snap.connectOob ?? ''
  // the invitation travels as the link itself, the form every wallet's scanner understands
  const invitationUrl = `${snap.config.publicUrl.replace(/\/+$/, '')}/app/connect?oob=${encodeURIComponent(oob)}`
  useEffect(() => {
    if (!oob) return
    QRCode.toDataURL(invitationUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(setQr, () => setQr(''))
  }, [invitationUrl, oob])
  return (
    <div className="panel connect-page">
      <button type="button" className="btn small back" onClick={() => hub.setView('list')}>
        <ArrowLeft size={16} aria-hidden="true" /> {t('link.back')}
      </button>
      <h1>{t('link.connectTitle')}</h1>
      <p className="muted">{t('link.connectHint')}</p>
      {qr ? <img className="qr" src={qr} alt={t('link.connectTitle')} width={240} height={240} /> : null}
    </div>
  )
}
