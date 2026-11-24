/**
 * The danger red of what cannot be undone, as the Ayni app draws it: in the agent's menu, Disconnect, and Remove
 * while the browser is not linked; Close for good in a conversation's menu; Delete in a message's. The dark theme has its own red,
 * the app's (`DARK.red`), so that the words read at WCAG 2.2 AA (4.5:1) on the page, a menu and a card in both themes,
 * dark by choice and dark by system; what is written on a red ground (the unread count, Stop) takes the colour that
 * reads on it.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Column, ConversationRow } from '../src/components/Column.js'
import {
  agentRecord,
  byText,
  click,
  PERSONAL,
  record,
  render,
  SPACES,
  setup,
  TRUCK,
  tab,
  teardown,
} from './spacesFixture.js'
import { css, rule } from './stylesheet.js'

beforeAll(setup)
afterEach(teardown)

describe("the entries of the agent's menu that cannot be undone are in red, as in the app", () => {
  const redOf = async (hub: Awaited<ReturnType<typeof tab>>) => {
    const el = await render(hub, <Column />)
    await click(el.querySelector('.agent-row [aria-label="Agent options"]'))
    const entries = [...el.querySelectorAll('.agent-row [role="menuitem"]')]
    const red = entries.filter((e) => e.classList.contains('danger')).map((e) => e.textContent)
    expect(entries.length).toBeGreaterThan(red.length)
    return red
  }

  it('Disconnect while linked, and no other entry', async () => {
    const hub = await tab({
      sessions: [record({ sessionId: 's1', title: 'Overtime for November', spaceId: PERSONAL.id })],
      spaces: SPACES,
    })
    expect(await redOf(hub)).toEqual(['Disconnect'])
  })

  it('Remove while not linked, and no other entry', async () => {
    const hub = await tab({
      spaces: SPACES,
      snapshot: { agents: [{ ...agentRecord(), deviceHandle: undefined, deviceSecret: undefined }] as never },
    })
    expect(await redOf(hub)).toEqual(['Remove'])
  })

  it("Close for good, in a conversation's menu", async () => {
    const hub = await tab({
      sessions: [record({ sessionId: 's3', title: 'Caliper check', spaceId: TRUCK.id, archived: true })],
      spaces: SPACES,
    })
    const el = await render(hub, <ConversationRow session={hub.getSnapshot().sessions[0]} selected={false} />)
    await click(el.querySelector('[aria-label="Agent options"]'))
    expect(byText(el, '[role="menuitem"]', 'Close for good')?.classList.contains('danger')).toBe(true)
  })
})

describe('the danger red in both themes (WCAG 2.2 AA)', () => {
  const token = (name: string) => {
    const value = new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(css)?.[1]
    if (!value) throw new Error(`no --${name}`)
    return value
  }
  const block = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`${escaped} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''
  }
  const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lum = (c: number[]) => 0.2126 * lin(c[0] ?? 0) + 0.7152 * lin(c[1] ?? 0) + 0.0722 * lin(c[2] ?? 0)
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x) as [number, number]
    return (hi + 0.05) / (lo + 0.05)
  }

  it('each dark block takes the dark red, and what is written on it, from the dark palette', () => {
    expect(block(':root')).toContain('--danger: var(--light-danger);')
    expect(block(':root')).toContain('--danger-contrast: var(--light-dangerContrast);')
    const system = block('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"])')
    const chosen = block(':root[data-theme="dark"]')
    for (const dark of [system, chosen]) {
      expect(dark).toContain('--danger: var(--dark-danger);')
      expect(dark).toContain('--danger-contrast: var(--dark-dangerContrast);')
    }
    // the app's reds
    expect(token('light-danger')).toBe('#b91c1c')
    expect(token('dark-danger')).toBe('#f87171')
  })

  it('paints the entries, and what is written on a red ground, with the tokens', () => {
    expect(css).toMatch(/\.menu-popover button\.danger,[^{]*\{\s*color: var\(--danger\);/)
    expect(css).toMatch(/\.msg-menu button\[role="menuitem"\]\.danger,[^{]*\{\s*color: var\(--danger\);/)
    expect(rule('.menu-popover').background).toBe('var(--bg)')
    expect(rule('.menu-popover button:hover').background).toBe('var(--surface)')
    for (const selector of ['.badge', '.send.danger', '.icon-btn.danger']) {
      expect(rule(selector).background, selector).toBe('var(--danger)')
      expect(rule(selector).color, selector).toBe('var(--danger-contrast)')
    }
  })

  it('reads at 4.5:1 at least: the words on the page, a menu, an entry under the pointer and a card', () => {
    const figures: Record<string, Record<string, number>> = {}
    for (const theme of ['light', 'dark']) {
      const of = (name: string) => token(`${theme}-${name}`)
      const f = {
        // a menu is on the page's ground, an entry under the pointer and a card on the surface
        onPage: ratio(of('danger'), of('bg')),
        onSurface: ratio(of('danger'), of('surface')),
        // the unread count and Stop, on the red
        onRed: ratio(of('dangerContrast'), of('danger')),
      }
      for (const [name, value] of Object.entries(f)) expect(value, `${theme}: ${name}`).toBeGreaterThanOrEqual(4.5)
      figures[theme] = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v * 100) / 100]))
    }
    expect(figures).toEqual({
      light: { onPage: 6.47, onSurface: 6.19, onRed: 6.47 },
      dark: { onPage: 6.77, onSurface: 6.41, onRed: 6.77 },
    })
  })
})
