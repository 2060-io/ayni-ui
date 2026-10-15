/**
 * The About page (UI-SHELL-017, D35): opened from the brand mark at the bottom of the rail, in the area
 * where settings open. The mark and the name, then what Ayni is, why the name, and why it is the future,
 * each with an illustration in the brand's light language.
 */
import { ArrowLeft, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'

const BLOCKS = [
  { key: 'what', art: '/brand/about/seal.svg' },
  { key: 'name', art: '/brand/about/reciprocity.svg' },
  { key: 'future', art: '/brand/about/path.svg' },
] as const

export function About() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const mark = snap.brand.mark ?? snap.brand.logo
  return (
    <div className="panel about">
      <button type="button" className="btn small back" onClick={() => hub.setView('list')}>
        <ArrowLeft size={16} /> {t('app.back')}
      </button>
      <div className="row-between">
        <h1>{t('about.title')}</h1>
        <button type="button" className="icon-btn" aria-label={t('app.close')} onClick={() => hub.setView('list')}>
          <X size={20} />
        </button>
      </div>
      <div className="about-hero">
        {mark ? <img src={mark} alt="" width={88} height={88} /> : null}
        <div>
          <div className="about-wordmark">{snap.brand.appName}</div>
          <p className="muted">{t('about.tagline')}</p>
        </div>
      </div>
      {BLOCKS.map((b) => (
        <section key={b.key} className="about-block">
          <img src={b.art} alt="" />
          <div>
            <h2>{t(`about.${b.key}.title`)}</h2>
            <p>{t(`about.${b.key}.p1`)}</p>
            <p>{t(`about.${b.key}.p2`)}</p>
          </div>
        </section>
      ))}
      <p className="muted about-foot">
        {t('about.verana')}{' '}
        <a href="https://verana.io" target="_blank" rel="noopener noreferrer">
          {t('about.learnMore')}
        </a>
      </p>
    </div>
  )
}
