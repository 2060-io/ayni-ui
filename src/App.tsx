import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AddPage } from './components/AddPage.js'
import { Column } from './components/Column.js'
import { Conversation } from './components/Conversation.js'
import { MessageInfo } from './components/Details.js'
import { Directory } from './components/Directory.js'
import { Rail } from './components/Rail.js'
import { Settings } from './components/Settings.js'
import { Splitter } from './components/Splitter.js'
import type { Hub } from './state/hub.js'
import { HubContext, useSnapshot } from './state/useHub.js'

function Shell() {
  const snap = useSnapshot()
  const { t } = useTranslation()
  useEffect(() => {
    document.documentElement.dataset.theme = snap.prefs.theme === 'system' ? '' : snap.prefs.theme
  }, [snap.prefs.theme])
  if (!snap.ready) return <div className="center">{t('app.loading')}</div>
  const showConversation = snap.view === 'conversation' && snap.selectedSessionId
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
    snap.view === 'directory' ? (
      <Directory />
    ) : snap.view === 'add' ? (
      <AddPage />
    ) : snap.view === 'settings' ? (
      <Settings />
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
