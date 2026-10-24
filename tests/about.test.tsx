/** The About page paints at once: its illustrations are bundled, fetched at start and decoded with the frame (UI-SHELL-017). */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ABOUT_ART, preloadAboutArt } from '../src/brand/aboutArt.js'
import { About } from '../src/components/About.js'
import { initI18n } from '../src/i18n/index.js'
import { Hub } from '../src/state/hub.js'
import { HubContext } from '../src/state/useHub.js'

const config = {
  publicUrl: 'http://ui.test',
  singleAgent: false,
  trustPolicy: 'refuse' as const,
  trustRecheckIntervalSeconds: 600,
  veranaIndexerUrl: 'http://indexer.test',
  veranaGraphUrl: 'http://graph.test',
  allowedAgentOrigins: [],
  locales: ['en'],
  soundsEnabled: false,
  installPromptEnabled: false,
}

let root: Root | undefined
let host: HTMLDivElement | undefined

beforeAll(() => {
  initI18n(['en'], 'en', 'en')
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
})

describe('About page art', () => {
  it('ships three bundled illustrations, preloaded once and painted with the frame', async () => {
    const urls = Object.values(ABOUT_ART)
    expect(urls).toHaveLength(3)
    for (const url of urls) expect(url).toMatch(/\.svg$/)
    expect(urls.some((u) => u.startsWith('/brand/'))).toBe(false)

    const held = preloadAboutArt()
    expect(held.map((img) => img.src.replace(/^http:\/\/[^/]+/, ''))).toEqual(urls)
    expect(preloadAboutArt()).toBe(held)

    const hub = new Hub(config, { appName: 'Ayni' })
    // @ts-expect-error private, set the in-memory snapshot directly for rendering
    hub.snapshot = { ...hub.getSnapshot(), ready: true }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <HubContext.Provider value={hub}>
          <About />
        </HubContext.Provider>
      )
    })
    const imgs = Array.from(host.querySelectorAll<HTMLImageElement>('.about-block img'))
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(urls)
    for (const img of imgs) expect(img.getAttribute('decoding')).toBe('sync')
  })
})
