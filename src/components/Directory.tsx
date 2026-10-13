/** Directory (D20, UI-AGENTS-004): every Verifiable Service declaring a HologramAgUI endpoint, trusted first. */
import { type DirectoryHit, searchDirectory } from '@2060.io/hologram-ui-core'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'

export function Directory() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')
  const [untrusted, setUntrusted] = useState(false)
  const [hits, setHits] = useState<DirectoryHit[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = async (more = false) => {
    setBusy(true)
    try {
      const page = await searchDirectory(snap.config.veranaGraphUrl, {
        freeText: filter,
        includeUntrusted: untrusted,
        cursor: more ? cursor : null,
      })
      setHits((h) => (more ? [...h, ...page.hits] : page.hits))
      setCursor(page.cursor)
    } catch (e) {
      hub.notify('error', String((e as Error).message))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 300)
    return () => clearTimeout(timer)
  }, [filter, untrusted])
  const sorted = [...hits].sort((a, b) => Number(b.trusted) - Number(a.trusted))
  return (
    <div className="panel">
      <button type="button" className="btn small back" onClick={() => hub.setView('list')}>
        <ArrowLeft size={16} /> {t('app.back')}
      </button>
      <h1>{t('directory.title')}</h1>
      <input
        className="input"
        type="search"
        placeholder={t('directory.filter')}
        aria-label={t('directory.filter')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <label className="field" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center', marginTop: 8 }}>
        <input type="checkbox" checked={untrusted} onChange={(e) => setUntrusted(e.target.checked)} />{' '}
        {t('directory.includeUntrusted')}
      </label>
      {!busy && sorted.length === 0 ? <div className="muted">{t('directory.empty')}</div> : null}
      {sorted.map((h) => (
        <div key={h.did} className="dir-row">
          <Avatar name={h.service?.name ?? h.did} src={h.trusted ? h.service?.logoUri : undefined} size={40} />
          <div>
            <div className="name">{h.service?.name ?? h.did}</div>
            <div className="sub">
              {h.operator?.name}
              {h.operator?.countryCode ? ` (${h.operator.countryCode})` : ''} ·{' '}
              {h.trusted ? t('trust.trusted') : t('trust.untrusted')}
            </div>
            {h.service?.description ? <div className="sub">{h.service.description}</div> : null}
          </div>
          <button
            type="button"
            className="btn small"
            disabled={!h.trusted && snap.config.trustPolicy === 'refuse'}
            onClick={() =>
              void hub.addAgent(h.descriptorUrl || h.did).catch((e) => hub.notify('error', String(e.message ?? e)))
            }
          >
            {t('directory.open')}
          </button>
        </div>
      ))}
      {cursor ? (
        <button type="button" className="btn" disabled={busy} onClick={() => void load(true)}>
          {t('directory.more')}
        </button>
      ) : null}
    </div>
  )
}
