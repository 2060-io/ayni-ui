/** The plus page (UI-AGENTS-001, D32): search the Trust Graph, or add an agent by DID or URL. */
import { Link2, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub } from '../state/useHub.js'
import { AddAgent } from './AddAgent.js'

export function AddPage() {
  const hub = useHub()
  const { t } = useTranslation()
  const [byDid, setByDid] = useState(false)
  return (
    <div className="panel">
      <h1>{t('add.pageTitle')}</h1>
      <div className="tiles">
        <button type="button" className="tile" onClick={() => hub.setView('directory')}>
          <Search size={28} aria-hidden="true" />
          <span className="tile-title">{t('add.tileSearch')}</span>
          <span className="muted">{t('add.tileSearchHint')}</span>
        </button>
        <button
          type="button"
          className={['tile', byDid ? 'selected' : ''].join(' ')}
          aria-expanded={byDid}
          onClick={() => setByDid((v) => !v)}
        >
          <Link2 size={28} aria-hidden="true" />
          <span className="tile-title">{t('add.tileDid')}</span>
          <span className="muted">{t('add.tileDidHint')}</span>
        </button>
      </div>
      {byDid ? <AddAgent embedded /> : null}
    </div>
  )
}
