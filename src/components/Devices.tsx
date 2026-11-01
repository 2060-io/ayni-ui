/** Linked devices of the person with an agent (UI-AGENTS-006, PROF-SESS-011/012): list and unlink. */
import type { AgentRecord } from '@ayni.org/ayni-ui-core'
import { Laptop, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub } from '../state/useHub.js'

interface Device {
  handle: string
  client: { name: string; version: string; platform: string }
  createdAt: string
  lastUsedAt: string
  current: boolean
}

export function DevicesDialog({ agent, onClose }: { agent: AgentRecord; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const hub = useHub()
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [error, setError] = useState('')
  const load = () =>
    hub
      .listDevices(agent.did)
      .then((list) => setDevices(list as Device[]))
      .catch((e) => setError(String((e as Error).message)))
  useEffect(() => {
    void load()
  }, [agent.did])
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('devices.title')}
      className="panel"
      style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 40, maxWidth: 'none' }}
    >
      <div className="row-between">
        <h1>{t('devices.title')}</h1>
        <button type="button" className="icon-btn" aria-label={t('app.close')} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <p className="muted">{t('devices.hint', { name: agent.name })}</p>
      {error ? <div className="banner warning">{error}</div> : null}
      {devices === null ? (
        <div className="muted">{t('app.loading')}</div>
      ) : devices.length === 0 ? (
        <div className="muted">{t('devices.none')}</div>
      ) : (
        <ul className="device-list">
          {devices.map((d) => (
            <li key={d.handle} className="device-row">
              <Laptop size={20} aria-hidden="true" />
              <span className="device-body">
                <span className="device-name">
                  {d.client.platform}
                  {d.current ? <span className="tag">{t('devices.thisBrowser')}</span> : null}
                </span>
                <span className="muted">
                  {t('devices.linked', { time: formatTime(d.createdAt, i18n.language) })} ·{' '}
                  {t('devices.lastUsed', { time: formatTime(d.lastUsedAt, i18n.language) })}
                </span>
              </span>
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  void hub
                    .unlinkDevice(agent.did, d.handle)
                    .then(() => (d.current ? onClose() : load()))
                    .catch((e) => setError(String((e as Error).message)))
                }
              >
                {t('devices.unlink')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
