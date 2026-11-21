/**
 * Link your phone (D8, D9; UI-BIND-002..009, UI-BIND-013): QR, binding code, wallet link on mobile, and Show a new
 * code. A code that can no longer link is replaced by itself while the page is visible: material that expired, and a
 * session that closed before the phone linked it.
 */
import type { SessionRecord } from '@ayni.org/ayni-ui-core'
import { Loader2, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub } from '../state/useHub.js'

const isMobile = () => /Android|iPhone|iPad/.test(navigator.userAgent)
const visible = () => document.visibilityState === 'visible'

export function Binding({ session }: { session: SessionRecord }) {
  const { t } = useTranslation()
  const hub = useHub()
  const [qr, setQr] = useState<string>('')
  const [now, setNow] = useState(Date.now())
  const [renewing, setRenewing] = useState(false)
  // said to a screen reader once a new code is on screen; focus stays on the button, which never moves
  const [announced, setAnnounced] = useState('')
  const busy = useRef(false)
  const binding = session.state === 'provisional' ? session.binding : undefined
  useEffect(() => {
    if (!binding) return
    // the invitation is rendered only, never parsed or stored beyond the opaque string (UI-BIND-008)
    QRCode.toDataURL(binding.oobUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(setQr, () => setQr(''))
  }, [binding])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const left = binding ? Math.max(0, Math.round((Date.parse(binding.expiresAt) - now) / 1000)) : 0
  // the code can no longer link: its material expired, or its session closed before the phone linked it
  const dead = left === 0
  // the agent's clock ended it (UI-BIND-006, profile section 5): replaced by itself; any other closure waits for
  // the person's Show a new code
  const timedOut = session.state === 'provisional' || session.closedReason === 'expired'
  const renew = useCallback(
    (auto: boolean) => {
      if (busy.current) return
      busy.current = true
      setRenewing(true)
      const before = binding?.bindingCode
      hub
        .newBindingCode(session.sessionId)
        .then(
          (next) => {
            const code = next?.state === 'provisional' ? next.binding?.bindingCode : undefined
            if (code && code !== before) setAnnounced(t('bind.newCodeShown', { code }))
          },
          (e) => {
            // a replacement the person did not ask for that fails leaves the button, and is tried again when the
            // page comes back in front
            if (!auto) hub.notify('error', String(e.message ?? e))
          }
        )
        .finally(() => {
          busy.current = false
          setRenewing(false)
        })
    },
    [hub, session.sessionId, binding?.bindingCode, t]
  )
  // what made this code dead: one replacement by itself each, and again each time the page comes back in front
  const deadAs = dead && timedOut ? `${session.sessionId}:${binding?.expiresAt ?? session.closedReason}` : ''
  const tried = useRef('')
  useEffect(() => {
    if (!deadAs) return
    const tryNow = () => {
      if (!visible()) return
      tried.current = deadAs
      renew(true)
    }
    if (tried.current !== deadAs) tryNow()
    document.addEventListener('visibilitychange', tryNow)
    return () => document.removeEventListener('visibilitychange', tryNow)
  }, [deadAs, renew])
  return (
    <div className="panel link-screen" style={{ textAlign: 'center' }}>
      <h1>{t('bind.title')}</h1>
      <p>{t('bind.scan')}</p>
      {binding && !dead ? (
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
              {session.rebindAsked ? t('bind.phoneAsked') : t('bind.manual')}
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
          {/* the browser is told nothing of a link refused or cancelled on the phone (UI-BIND-013) */}
          <p className="muted link-hint">{t('bind.refused')}</p>
        </>
      ) : (
        <p className="muted link-hint">
          {renewing ? t('bind.renewing') : timedOut ? t('bind.expired') : t('bind.ended')}
        </p>
      )}
      {/* one button in every state, so that focus stays on it while the code changes */}
      <div className="link-renew">
        <button
          type="button"
          className={binding && !dead ? 'btn new-code' : 'btn primary'}
          aria-disabled={renewing || undefined}
          onClick={() => renew(false)}
        >
          {renewing ? (
            <Loader2 size={16} className="spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={16} aria-hidden="true" />
          )}
          {t('bind.newCode')}
        </button>
        <p className="sr-only" role="status">
          {announced}
        </p>
      </div>
    </div>
  )
}
