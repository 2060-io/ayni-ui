import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { preloadAboutArt } from './brand/aboutArt.js'
import { About } from './components/About.js'
import { AddPage } from './components/AddPage.js'
import { Column } from './components/Column.js'
import { ConnectPage } from './components/ConnectPage.js'
import { Conversation } from './components/Conversation.js'
import { MessageInfo } from './components/Details.js'
import { Directory } from './components/Directory.js'
import { PhonePage } from './components/PhonePage.js'
import { ProofOfTrust } from './components/ProofOfTrust.js'
import { Rail } from './components/Rail.js'
import { Settings } from './components/Settings.js'
import { Splitter } from './components/Splitter.js'
import type { Hub } from './state/hub.js'
import { HubContext, useHub, useSnapshot } from './state/useHub.js'

function Shell() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  useEffect(() => {
    document.documentElement.dataset.theme = snap.prefs.theme === 'system' ? '' : snap.prefs.theme
  }, [snap.prefs.theme])
  // the About page's illustrations are fetched now, so the page shows at once when the mark is pressed (UI-SHELL-017)
  useEffect(() => {
    preloadAboutArt()
  }, [])
  // the person's accent overrides the brand's; the contrast colour follows its luminance (UI-THEME-003)
  useEffect(() => {
    const root = document.documentElement.style
    const hex = snap.prefs.accent
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) {
      root.removeProperty('--accent')
      root.removeProperty('--accent-contrast')
      return
    }
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    root.setProperty('--accent', hex)
    root.setProperty('--accent-contrast', luminance > 0.4 ? '#111827' : '#ffffff')
  }, [snap.prefs.accent])
  if (!snap.ready) return <div className="center">{t('app.loading')}</div>
  // at phone width the conversation area takes the screen for every view but the list
  const showConversation = snap.view !== 'list' && (snap.view !== 'conversation' || snap.selectedSessionId)
  const trustAgent = snap.view === 'trust' ? snap.agents.find((a) => a.did === snap.trustFor?.did) : undefined
  const sheet = !!snap.inspect && snap.inspect.sessionId === snap.selectedSessionId
  const classes = [
    'app',
    snap.config.singleAgent ? 'single' : '',
    showConversation ? 'show-conversation' : '',
    sheet ? 'with-sheet' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const main =
    snap.view === 'trust' && trustAgent ? (
      <ProofOfTrust agent={trustAgent} connect={!!snap.trustFor?.connect} onClose={() => hub.closeTrust()} />
    ) : snap.view === 'directory' ? (
      <Directory />
    ) : snap.view === 'add' ? (
      <AddPage />
    ) : snap.view === 'about' ? (
      <About />
    ) : snap.view === 'settings' ? (
      <Settings />
    ) : snap.view === 'phone' ? (
      <PhonePage />
    ) : snap.view === 'connect' ? (
      <ConnectPage />
    ) : (
      <Conversation />
    )
  return (
    <div className={classes}>
      <Rail />
      <Column />
      <section className="conversation" aria-live="off">
        <Splitter />
        {main}
      </section>
      {sheet ? (
        <aside className="details sheet-panel" aria-label={t('details.message')}>
          <MessageInfo />
        </aside>
      ) : null}
      {snap.notice ? (
        <div className="toast" role="status">
          {snap.notice.text}
        </div>
      ) : null}
    </div>
  )
}

export function App({ hub }: { hub: Hub }) {
  return (
    <HubContext.Provider value={hub}>
      <Shell />
    </HubContext.Provider>
  )
}
