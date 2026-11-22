import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { preloadAboutArt } from './brand/aboutArt.js'
import { About } from './components/About.js'
import { AccountsPage } from './components/Accounts.js'
import { AddPage } from './components/AddPage.js'
import { AdminPage } from './components/AdminRoles.js'
import { Column } from './components/Column.js'
import { ConnectPage } from './components/ConnectPage.js'
import { Conversation } from './components/Conversation.js'
import { MessageInfo } from './components/Details.js'
import { Directory } from './components/Directory.js'
import { KeepsPage } from './components/Keeps.js'
import { MemorySheet } from './components/Memories.js'
import { NotificationsPage } from './components/Notifications.js'
import { PhonePage } from './components/PhonePage.js'
import { ProofOfTrust } from './components/ProofOfTrust.js'
import { Rail } from './components/Rail.js'
import { Settings } from './components/Settings.js'
import { SharedConversationView } from './components/SharedConversation.js'
import { SpacePage } from './components/SpacePage.js'
import { Splitter } from './components/Splitter.js'
import { UpdateBanner } from './components/UpdateBanner.js'
import type { Hub } from './state/hub.js'
import { type AppUpdate, appUpdate, useNewVersion } from './state/update.js'
import { HubContext, useHub, useSnapshot } from './state/useHub.js'

function Shell({ update }: { update: AppUpdate }) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const newVersion = useNewVersion(update)
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
    newVersion ? 'with-update' : '',
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
      <Settings update={update} />
    ) : snap.view === 'phone' ? (
      <PhonePage />
    ) : snap.view === 'connect' ? (
      <ConnectPage />
    ) : snap.view === 'space' ? (
      <SpacePage />
    ) : snap.view === 'keeps' ? (
      <KeepsPage />
    ) : snap.view === 'admin' ? (
      <AdminPage />
    ) : snap.view === 'shared' ? (
      <SharedConversationView />
    ) : snap.view === 'accounts' ? (
      <AccountsPage />
    ) : snap.view === 'notifications' ? (
      <NotificationsPage />
    ) : (
      <Conversation />
    )
  return (
    <div className={classes}>
      <UpdateBanner update={update} />
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
      {snap.memoryFor ? <MemorySheet /> : null}
      {snap.notice ? (
        <div className="toast" role="status">
          {snap.notice.text}
        </div>
      ) : null}
    </div>
  )
}

export function App({ hub, update = appUpdate }: { hub: Hub; update?: AppUpdate }) {
  return (
    <HubContext.Provider value={hub}>
      <Shell update={update} />
    </HubContext.Provider>
  )
}
