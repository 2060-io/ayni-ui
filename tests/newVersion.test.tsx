/**
 * A new version of the UI (UI-PLAT-007), found by Fabrice on devnet on 2026-11-21: the web UI went from 0.19.0 to
 * 0.20.0 and his browser kept running the old one. The service worker is registered in `prompt` mode, so a new one
 * installs and waits; nothing said so, and every reload was served by the old one until every tab was closed. Now a
 * waiting version shows a banner with Reload, which writes what the message forms hold, lets the new worker take over
 * and loads the page again; the worker is asked for a new version when the tab is visible again and every hour.
 * `virtual:pwa-register` (vite-plugin-pwa's registration, over workbox-window) is mocked: the test plays its callbacks.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RegisterSWOptions } from 'virtual:pwa-register'
import { MemoryDeviceStore, UPDATE_COPY } from '@ayni.org/ayni-ui-core'
import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.js'
import { Conversation } from '../src/components/Conversation.js'
import { Settings } from '../src/components/Settings.js'
import en from '../src/i18n/en.json'
import es from '../src/i18n/es.json'
import fr from '../src/i18n/fr.json'
import pt from '../src/i18n/pt.json'
import { AppUpdate, startUpdates, UPDATE_CHECK_MS } from '../src/state/update.js'
import { byText, click, fakeAgent, record, render, setup, tab, teardown, transcript, type } from './spacesFixture.js'
import { css } from './stylesheet.js'

const registerSW = vi.fn()
vi.mock('virtual:pwa-register', () => ({ registerSW: (options: RegisterSWOptions) => registerSW(options) }))

beforeAll(setup)
let update: AppUpdate | undefined
afterEach(() => {
  update?.stop()
  update = undefined
  vi.useRealTimers()
  setVisibility('visible')
  teardown()
})

/** The worker that waits, and the registration as workbox-window gives it. */
function registration(options: { waiting?: boolean } = {}) {
  const worker = Object.assign(new EventTarget(), { state: 'installed' as ServiceWorkerState })
  return {
    worker,
    value: {
      waiting: options.waiting === false ? null : worker,
      update: vi.fn(async () => undefined),
      pushManager: { subscribe: vi.fn(), getSubscription: vi.fn(), permissionState: vi.fn() },
    },
  }
}

/** Registration as the production build does it, with what Reload writes first and what loads the page again. */
async function started(beforeReload: () => Promise<void> = async () => undefined) {
  const updateSW = vi.fn(async (_reloadPage?: boolean) => undefined)
  registerSW.mockReturnValue(updateSW)
  const reloadPage = vi.fn()
  update = new AppUpdate(reloadPage)
  await startUpdates(beforeReload, update)
  expect(registerSW).toHaveBeenCalledTimes(1)
  const options = registerSW.mock.calls[0]?.[0] as RegisterSWOptions
  return { update, updateSW, reloadPage, options }
}

/** The shell of a tab with one conversation open. */
async function shell(app: AppUpdate, store?: MemoryDeviceStore) {
  fakeAgent([])
  const hub = await tab({
    sessions: [record({ sessionId: 's1', title: 'Truck 12' })],
    transcripts: [transcript('s1')],
    snapshot: { selectedSessionId: 's1', view: 'conversation' },
    store,
  })
  const el = await render(hub, <App hub={hub} update={app} />)
  return { hub, el, banner: () => el.querySelector<HTMLElement>('.update-banner') }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('a new version (UI-PLAT-007)', () => {
  it('registers the worker at once and in prompt mode, so a version is never swapped without the person', async () => {
    const { options } = await started()
    expect(options.immediate).toBe(true)
    expect(typeof options.onNeedRefresh).toBe('function')
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8')
    expect(config).toMatch(/registerType: 'prompt'/)
    // explicit registration, no worker that skips waiting or claims the page by itself
    expect(config).toMatch(/injectRegister: null/)
    expect(config).not.toMatch(/skipWaiting|clientsClaim/)
  })

  it('shows the banner, with Reload, once a new version waits', async () => {
    const { options } = await started()
    const { el, banner } = await shell(update as AppUpdate)
    expect(banner()).toBeNull()
    await act(async () => options.onNeedRefresh?.())
    const b = banner() as HTMLElement
    expect(b).toBeTruthy()
    expect(b.getAttribute('role')).toBe('status')
    expect(b.querySelector('span')?.textContent).toBe('A new version of Ayni is available.')
    expect(b.querySelector('button')?.textContent).toBe('Reload')
    // across the top of the shell, above the rail, the list and the conversation
    expect(b.parentElement?.className).toContain('app')
    expect(b.parentElement?.className).toContain('with-update')
    expect(b.parentElement?.firstElementChild).toBe(b)
    // it stays: nothing takes it away but the reload
    await act(async () => options.onOfflineReady?.())
    expect(el.querySelector('.update-banner')).toBe(b)
  })

  it('shows no banner in any other case: registered, ready offline, a failed registration, a check', async () => {
    const { options } = await started()
    const { el, banner } = await shell(update as AppUpdate)
    const reg = registration()
    await act(async () => {
      options.onRegisteredSW?.('/sw.js', reg.value as never)
      options.onOfflineReady?.()
      options.onRegisterError?.(new Error('blocked'))
    })
    setVisibility('visible')
    await act(async () => undefined)
    expect(banner()).toBeNull()
    expect(el.querySelector('.app')?.className).not.toContain('with-update')
    // and no push subscription, ever (UI-PLAT-002)
    expect(reg.value.pushManager.subscribe).not.toHaveBeenCalled()
    expect(reg.value.pushManager.getSubscription).not.toHaveBeenCalled()
  })

  it('Reload writes what the message form holds, then lets the waiting worker take over and reloads once', async () => {
    const order: string[] = []
    let flush: () => Promise<void> = async () => undefined
    const { options, updateSW, reloadPage } = await started(async () => {
      order.push('drafts')
      await flush()
    })
    const store = new MemoryDeviceStore()
    const { hub, el, banner } = await shell(update as AppUpdate, store)
    flush = () => hub.flushDrafts()
    const reg = registration()
    options.onRegisteredSW?.('/sw.js', reg.value as never)
    updateSW.mockImplementation(async () => {
      order.push(`update: ${(await store.getSession('s1'))?.draft}`)
    })
    // typed just now: the 400 ms after which a draft is written have not passed
    await type(el.querySelector('textarea'), 'Check the brakes of truck 12')
    await act(async () => options.onNeedRefresh?.())
    await click(byText(banner() as HTMLElement, 'button', 'Reload'))
    expect(updateSW).toHaveBeenCalledTimes(1)
    expect(updateSW).toHaveBeenCalledWith(true)
    expect(order).toEqual(['drafts', 'update: Check the brakes of truck 12'])
    // the new worker takes control (workbox-window's `controlling`), then is active: the page loads again, once
    await act(async () => options.onNeedReload?.())
    reg.worker.state = 'activated'
    reg.worker.dispatchEvent(new Event('statechange'))
    await act(async () => undefined)
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })

  it('keeps the draft across the reload: the next page shows it in the message form', async () => {
    let flush: () => Promise<void> = async () => undefined
    const { options, reloadPage } = await started(() => flush())
    const store = new MemoryDeviceStore()
    const first = await shell(update as AppUpdate, store)
    flush = () => first.hub.flushDrafts()
    options.onRegisteredSW?.('/sw.js', registration({ waiting: false }).value as never)
    await type(first.el.querySelector('textarea'), 'Half a sentence')
    await act(async () => options.onNeedRefresh?.())
    await click(byText(first.banner() as HTMLElement, 'button', 'Reload'))
    expect(reloadPage).toHaveBeenCalledTimes(1)
    teardown()
    // the page loaded again: a new hub reads the same store
    fakeAgent([])
    const again = await tab({ store, snapshot: { selectedSessionId: 's1', view: 'conversation' } })
    const el = await render(again, <Conversation />)
    expect(el.querySelector('textarea')?.value).toBe('Half a sentence')
  })

  it('a page the old worker did not control loads again once the new worker is active', async () => {
    const { options, updateSW, reloadPage } = await started()
    const reg = registration()
    options.onRegisteredSW?.('/sw.js', reg.value as never)
    options.onNeedRefresh?.()
    await (update as AppUpdate).reload()
    expect(updateSW).toHaveBeenCalledWith(true)
    expect(reloadPage).not.toHaveBeenCalled()
    reg.worker.state = 'activated'
    reg.worker.dispatchEvent(new Event('statechange'))
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })

  it('a version another tab already put in charge: Reload only loads the page again', async () => {
    const { options, updateSW, reloadPage } = await started()
    options.onRegisteredSW?.('/sw.js', registration({ waiting: false }).value as never)
    options.onNeedRefresh?.()
    await (update as AppUpdate).reload()
    expect(updateSW).not.toHaveBeenCalled()
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })

  it('a draft that cannot be written keeps the page and the banner', async () => {
    const { options, updateSW, reloadPage } = await started(async () => {
      throw new Error('quota')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    options.onRegisteredSW?.('/sw.js', registration().value as never)
    options.onNeedRefresh?.()
    await (update as AppUpdate).reload()
    expect(updateSW).not.toHaveBeenCalled()
    expect(reloadPage).not.toHaveBeenCalled()
    expect((update as AppUpdate).isWaiting()).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('asks for a new version when the tab is visible again, not while it is hidden', async () => {
    const { options } = await started()
    const reg = registration()
    options.onRegisteredSW?.('/sw.js', reg.value as never)
    setVisibility('hidden')
    expect(reg.value.update).not.toHaveBeenCalled()
    setVisibility('visible')
    expect(reg.value.update).toHaveBeenCalledTimes(1)
  })

  it('asks for a new version every hour while the tab stays open', async () => {
    // only the interval is faked: nothing here reads the date, so the test passes at any hour, midnight included
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    expect(UPDATE_CHECK_MS).toBe(60 * 60 * 1000)
    const { options } = await started()
    const reg = registration()
    options.onRegisteredSW?.('/sw.js', reg.value as never)
    vi.advanceTimersByTime(UPDATE_CHECK_MS - 1)
    expect(reg.value.update).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(reg.value.update).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(UPDATE_CHECK_MS)
    expect(reg.value.update).toHaveBeenCalledTimes(2)
    // a check that fails (offline, the server down) is left to the next one
    reg.value.update.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.advanceTimersByTime(UPDATE_CHECK_MS)
    expect(reg.value.update).toHaveBeenCalledTimes(3)
  })

  it('says it in the four languages, in the English the core gives', () => {
    const files = { en, es, fr, pt } as unknown as Record<string, Record<string, Record<string, string>>>
    for (const [path, text] of Object.entries(UPDATE_COPY)) {
      const [section, key] = path.split('.') as [string, string]
      expect(files.en?.[section]?.[key], path).toBe(text)
      for (const lang of ['es', 'fr', 'pt']) {
        const other = files[lang]?.[section]?.[key]
        expect(other, `${lang}.${path}`).toBeTruthy()
        expect(other, `${lang}.${path}`).not.toBe(text)
      }
    }
  })

  it('reads in both themes: light, dark by choice and dark by system', () => {
    const token = (name: string) => {
      const m = css.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))
      if (!m) throw new Error(`no token ${name}`)
      return m[1] as string
    }
    const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const lum = (c: number[]) => 0.2126 * lin(c[0] ?? 0) + 0.7152 * lin(c[1] ?? 0) + 0.0722 * lin(c[2] ?? 0)
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
      return (hi + 0.05) / (lo + 0.05)
    }
    // the banner is `.banner.info`, the accent at 10% over the background; Reload is `.btn.small.primary`
    expect(css).toMatch(/\.banner\.info \{\n {2}background: color-mix\(in srgb, var\(--accent\) 10%, var\(--bg\)\);/)
    expect(css).toMatch(/\.btn\.primary \{\n {2}background: var\(--accent\);\n {2}color: var\(--accent-contrast\);/)
    // dark by choice and dark by system take the same dark tokens
    const dark =
      /--accent: var\(--dark-accent\);\n\s+--accent-contrast: var\(--dark-accentContrast\);\n\s+--bg: var\(--dark-bg\);\n\s+--surface: var\(--dark-surface\);\n\s+--text: var\(--dark-text\);/
    const blocks = [/:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/, /:root\[data-theme="dark"\] \{([^}]*)\}/]
    for (const block of blocks) expect(css.match(block)?.[1]).toMatch(dark)
    const figures: Record<string, number[]> = {}
    for (const theme of ['light', 'dark']) {
      const [accent, bg, text, label] = ['accent', 'bg', 'text', 'accentContrast'].map((n) =>
        rgb(token(`${theme}-${n}`))
      )
      const banner = (accent as number[]).map((c, i) => 0.1 * c + 0.9 * ((bg as number[])[i] ?? 0))
      const f = [
        ratio(text as number[], banner),
        ratio(label as number[], accent as number[]),
        ratio(accent as number[], banner),
      ]
      figures[theme] = f.map((x) => Math.round(x * 100) / 100)
      // the words and Reload's label: AA for text; the button and its focus ring against the banner: 3:1
      expect(f[0], `${theme} text`).toBeGreaterThanOrEqual(4.5)
      expect(f[1], `${theme} Reload`).toBeGreaterThanOrEqual(4.5)
      expect(f[2], `${theme} button edge`).toBeGreaterThanOrEqual(3)
    }
    expect(figures).toEqual({ light: [15.44, 5.47, 4.76], dark: [14.33, 7.77, 8.47] })
  })
})

describe('the version running, in Settings (UI-PLAT-008)', () => {
  const versionOf = (file: string) =>
    (JSON.parse(readFileSync(join(process.cwd(), file), 'utf8')) as { version: string }).version

  async function settings(app: AppUpdate) {
    fakeAgent([])
    const hub = await tab({ snapshot: { view: 'settings' } })
    return render(hub, <Settings update={app} />)
  }

  it('shows the release of the UI and of its core, as the build injects them from their package files', async () => {
    const el = await settings(new AppUpdate(vi.fn()))
    expect(el.querySelector('.settings-version')?.textContent).toBe(`Version ${versionOf('package.json')}`)
    expect(el.querySelector('.settings-core')?.textContent).toBe(`Core ${versionOf('packages/core/package.json')}`)
    expect(versionOf('package.json')).toMatch(/^\d+\.\d+\.\d+/)
    // the build reads them from the package files, never a version written in the code
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8')
    expect(config).toContain("__APP_VERSION__: JSON.stringify(versionOf('./package.json'))")
    expect(config).toContain("__CORE_VERSION__: JSON.stringify(versionOf('./packages/core/package.json'))")
    // nothing waits: no line about a new version
    expect(el.querySelector('.settings-update')).toBeNull()
  })

  it('says when a new version waits, with the same Reload', async () => {
    const { options, updateSW } = await started()
    options.onRegisteredSW?.('/sw.js', registration().value as never)
    const el = await settings(update as AppUpdate)
    expect(el.querySelector('.settings-update')).toBeNull()
    await act(async () => options.onNeedRefresh?.())
    const line = el.querySelector('.settings-update') as HTMLElement
    expect(line.querySelector('span')?.textContent).toBe('A new version of Ayni is available.')
    await click(byText(line, 'button', 'Reload'))
    expect(updateSW).toHaveBeenCalledWith(true)
  })
})
