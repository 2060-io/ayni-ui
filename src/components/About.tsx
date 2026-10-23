/**
 * The About page (UI-SHELL-017, D35): opened from the brand mark at the bottom of the rail, in the area
 * where settings open. The mark and the name, then what Ayni is, why the name, and why it is the future,
 * each with an illustration in the brand's light language.
 */
import { ArrowLeft, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ABOUT_ART } from '../brand/aboutArt.js'
import { useHub, useSnapshot } from '../state/useHub.js'

const BLOCKS = [
  { key: 'what', art: ABOUT_ART.seal },
  { key: 'name', art: ABOUT_ART.reciprocity },
  { key: 'future', art: ABOUT_ART.path },
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
      <div className="about-close">
        <button type="button" className="icon-btn" aria-label={t('app.close')} onClick={() => hub.setView('list')}>
          <X size={20} />
        </button>
      </div>
      <div className="about-hero">
        {mark ? <img src={mark} alt="" width={128} height={128} /> : null}
        <div>
          <div className="about-wordmark">{snap.brand.appName}</div>
          <p className="muted">{t('about.tagline')}</p>
        </div>
      </div>
      {BLOCKS.map((b, i) => (
        <section key={b.key} className={['about-block', i % 2 ? 'flip' : ''].join(' ')}>
          {/* fetched at start (preloadAboutArt) and decoded with the frame: the page shows whole, at once */}
          <img src={b.art} alt="" decoding="sync" />
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
