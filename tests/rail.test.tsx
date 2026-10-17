/** Renders the rail in jsdom: the whole rail takes drops, the pin line always shows, a tile's context menu pins (UI-SHELL-011). */
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Column } from '../src/components/Column.js'
import { Rail } from '../src/components/Rail.js'
import { initI18n } from '../src/i18n/index.js'
import { Hub } from '../src/state/hub.js'
import { HubContext } from '../src/state/useHub.js'

const MIME = 'application/x-ayni-controller'
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

function controller(did: string, name: string, pinned: boolean, pinOrder = 0) {
  return { did, kind: 'organization' as const, name, pinned, pinOrder }
}

function hubWith(controllers: ReturnType<typeof controller>[]): Hub {
  const hub = new Hub(config, { appName: 'Ayni' })
  // @ts-expect-error private, set the in-memory snapshot directly for rendering
  hub.snapshot = {
    ...hub.getSnapshot(),
    ready: true,
    controllers,
    agents: [],
    sessions: [],
    selectedControllerDid: controllers[0]?.did ?? null,
  }
  vi.spyOn(hub, 'movePin').mockResolvedValue(undefined)
  vi.spyOn(hub, 'togglePin').mockResolvedValue(undefined)
  return hub
}

/** A drag event as jsdom lacks DragEvent: the pointer's y and a data transfer carrying our type. */
function dragEvent(type: string, init: { clientY?: number; did?: string }): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'clientY', { value: init.clientY ?? 0 })
  Object.defineProperty(ev, 'dataTransfer', {
    value: {
      types: [MIME],
      effectAllowed: 'uninitialized',
      dropEffect: 'none',
      setData() {},
      getData: () => init.did ?? '',
    },
  })
  return ev
}
function placeAt(el: Element, top: number, height: number) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ top, bottom: top + height, height, left: 0, right: 48, width: 48, x: 0, y: top }),
  })
}
async function startDrag(el: Element, did: string) {
  await act(async () => {
    el.dispatchEvent(dragEvent('dragstart', { did }))
    await new Promise((r) => setTimeout(r, 1))
  })
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

async function render(hub: Hub, el: ReactElement): Promise<HTMLDivElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(<HubContext.Provider value={hub}>{el}</HubContext.Provider>)
  })
  return host
}

describe('rail pinning', () => {
  it('unpins a tile dropped anywhere below the separator and pins one dropped above it', async () => {
    const hub = hubWith([controller('did:a', 'Acme', true, 1), controller('did:b', 'Bolt', false)])
    const el = await render(hub, <Rail />)
    const nav = el.querySelector('nav.rail') as HTMLElement
    const [a, b] = Array.from(el.querySelectorAll<HTMLButtonElement>('.rail-item:not(.ghost)'))
    placeAt(a, 40, 48)
    placeAt(el.querySelector('.rail-separator-wrap') as Element, 100, 14)
    const settings = el.querySelector('[aria-pressed]') as HTMLElement

    // the pinned tile, dragged far down onto the settings tile: the rest zone lights up and the drop unpins
    await startDrag(a, 'did:a')
    expect(a.classList.contains('dragging')).toBe(true)
    await act(async () => settings.dispatchEvent(dragEvent('dragover', { clientY: 400 })))
    expect(el.querySelector('.rail-rest')?.classList.contains('target')).toBe(true)
    await act(async () => settings.dispatchEvent(dragEvent('drop', { clientY: 400, did: 'did:a' })))
    expect(hub.movePin).toHaveBeenLastCalledWith('did:a', false, null)
    expect(a.classList.contains('dragging')).toBe(false)

    // the unpinned tile, dropped on the upper half of the pinned one: pinned before it
    await startDrag(b, 'did:b')
    await act(async () => nav.dispatchEvent(dragEvent('dragover', { clientY: 50 })))
    expect(a.classList.contains('drop-before')).toBe(true)
    await act(async () => nav.dispatchEvent(dragEvent('drop', { clientY: 50, did: 'did:b' })))
    expect(hub.movePin).toHaveBeenLastCalledWith('did:b', true, 'did:a')

    // dropped on the line itself: last among the pinned
    await startDrag(b, 'did:b')
    const line = el.querySelector('.rail-separator') as HTMLElement
    await act(async () => line.dispatchEvent(dragEvent('drop', { clientY: 104, did: 'did:b' })))
    expect(hub.movePin).toHaveBeenLastCalledWith('did:b', true, null)
    expect(hub.movePin).toHaveBeenCalledTimes(3)
  })

  it('shows the pin line with nothing pinned, and the context menu of a tile pins or unpins it', async () => {
    const hub = hubWith([controller('did:b', 'Bolt', false)])
    const el = await render(hub, <Rail />)
    expect(el.querySelector('.rail-separator')).not.toBeNull()
    expect(el.querySelector('.rail-pin')).not.toBeNull()
    expect(el.querySelector('.rail-menu')).toBeNull()
    const b = el.querySelector('.rail-item:not(.ghost)') as HTMLButtonElement
    await act(async () => {
      b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    const item = el.querySelector('.rail-menu [role="menuitem"]') as HTMLButtonElement
    expect(item.textContent).toContain('Pin')
    await act(async () => item.click())
    expect(hub.togglePin).toHaveBeenCalledWith('did:b')
    expect(el.querySelector('.rail-menu')).toBeNull()
  })

  it('offers no menu on the controller header any more', async () => {
    const hub = hubWith([controller('did:a', 'Acme', true, 1)])
    const el = await render(hub, <Column />)
    expect(el.querySelector('.controller-title')?.textContent).toContain('Acme')
    expect(el.querySelector('.column-header .icon-btn')).toBeNull()
  })
})
