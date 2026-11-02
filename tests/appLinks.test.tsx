/**
 * App links in the browser (UI-LINK-001/002/003, D38): a link on the app-link domain opens its web route in place
 * (Explore with the search typed, Settings, a service), the others show "on your phone" with the destination named;
 * stray parameters change nothing; a transcript link is marked for in-place handling with its destination as title,
 * while every other link opens in a new tab with no referrer and no opener.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Markdown } from '../src/components/Markdown.js'
import { initI18n } from '../src/i18n/index.js'
import { Hub } from '../src/state/hub.js'

const origin = location.origin
const config = {
  publicUrl: origin,
  singleAgent: false,
  trustPolicy: 'refuse' as const,
  trustRecheckIntervalSeconds: 600,
  veranaIndexerUrl: 'http://indexer.test',
  veranaGraphUrl: 'http://graph.test',
  allowedAgentOrigins: [],
  locales: ['en'],
  soundsEnabled: false,
  installPromptEnabled: false,
  appStoreUrl: 'https://apps.example/ayni',
}

beforeAll(() => {
  initI18n(['en'], 'en', 'en')
})

describe('hub.openAppLink', () => {
  it('opens Explore with the search typed and ignores stray parameters', () => {
    const hub = new Hub(config, { appName: 'Ayni' })
    expect(hub.openAppLink(`${origin}/app/explore?q=doctor&utm_source=x`)).toBe(true)
    expect(hub.getSnapshot().view).toBe('directory')
    expect(hub.takeDirectoryQuery()).toBe('doctor')
    expect(hub.takeDirectoryQuery()).toBeNull() // read once
  })

  it('shows "on your phone" for a destination without a web route', () => {
    const hub = new Hub(config, { appName: 'Ayni' })
    hub.openAppLink(`${origin}/app/wallet/history`)
    const snap = hub.getSnapshot()
    expect(snap.view).toBe('phone')
    expect(snap.phoneFor).toEqual({ path: 'wallet', segment: 'history' })
    hub.openAppLink(`${origin}/app/settings/backup`)
    expect(hub.getSnapshot().view).toBe('phone')
  })

  it('opens Settings and its devices section, Home, and the connect QR; refuses foreign links', () => {
    const hub = new Hub(config, { appName: 'Ayni' })
    hub.openAppLink(`${origin}/app/settings/devices`)
    expect(hub.getSnapshot()).toMatchObject({ view: 'settings', settingsSection: 'devices' })
    hub.openAppLink(`${origin}/app/home`)
    expect(hub.getSnapshot().view).toBe('list')
    hub.openAppLink(`${origin}/app/connect?oob=eyJhIjoxfQ`)
    expect(hub.getSnapshot()).toMatchObject({ view: 'connect', connectOob: 'eyJhIjoxfQ' })
    expect(hub.openAppLink('https://elsewhere.example/app/explore')).toBe(false)
    expect(hub.openAppLink(`${origin}/about`)).toBe(false)
  })
})

describe('transcript links (UI-LINK-003)', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined
  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('marks an app link for in-place handling with its destination as title, and keeps other links external', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    const text = `Find a doctor in [Explore](${origin}/app/explore?q=doctor) or read https://verana.io/docs.`
    act(() =>
      root?.render(
        <Markdown
          text={text}
          app={{ origin, title: (href) => (href.includes('/app/explore') ? 'Explore' : 'this page') }}
        />
      )
    )
    const links = Array.from(host.querySelectorAll('a'))
    expect(links).toHaveLength(2)
    const [app, external] = links
    expect(app.hasAttribute('data-app-link')).toBe(true)
    expect(app.getAttribute('title')).toBe('Explore')
    expect(app.getAttribute('target')).toBeNull()
    expect(external.hasAttribute('data-app-link')).toBe(false)
    expect(external.getAttribute('target')).toBe('_blank')
    expect(external.getAttribute('rel')).toContain('noopener')
    expect(external.getAttribute('rel')).toContain('noreferrer')
  })
})
