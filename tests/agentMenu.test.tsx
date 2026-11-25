/**
 * The agent's menu in the browser lists the entries the phone's menu of that agent lists, in the same order and with
 * the same words, and Remove only while the browser is not linked to the agent, as the phone offers Remove only while
 * it is not connected (UI-AGENTS-009, APP-HOME-020). The order and the words are the core's, which the app can read
 * too (`AGENT_MENU_ORDER`, `AGENT_MENU_COPY`).
 */
import { AGENT_MENU_COPY, AGENT_MENU_ORDER } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Column } from '../src/components/Column.js'
import en from '../src/i18n/en.json'
import es from '../src/i18n/es.json'
import fr from '../src/i18n/fr.json'
import pt from '../src/i18n/pt.json'
import { AGENT, agentRecord, click, PERSONAL, record, render, SPACES, setup, tab, teardown } from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

/** The entries the browser draws: every entry of the agent's menu but the phone's own. */
const BROWSER = AGENT_MENU_ORDER.filter((key) => !['signInMethods', 'authenticate', 'details'].includes(key))

const menuOf = async (hub: Awaited<ReturnType<typeof tab>>) => {
  const el = await render(hub, <Column />)
  await click(el.querySelector('.agent-row [aria-label="Agent options"]'))
  return [...el.querySelectorAll('.agent-row [role="menuitem"] .menu-label')].map((e) => e.textContent)
}

const unpaired = { agents: [{ ...agentRecord(), deviceHandle: undefined, deviceSecret: undefined }] as never }

describe("the agent's menu, as the phone's (UI-AGENTS-009)", () => {
  it("says in English the phone's words for every entry the browser draws, and in the other three languages too", () => {
    for (const key of BROWSER) {
      const path = `agentMenu.${key}` as const
      expect((en.agentMenu as Record<string, string>)[key], path).toBe(AGENT_MENU_COPY[path])
      for (const file of [es, fr, pt]) expect((file.agentMenu as Record<string, string>)[key], path).toBeTruthy()
    }
  })

  it("lists every entry in the phone's order, the browser's own among them", async () => {
    const hub = await tab({
      sessions: [record({ sessionId: 's1', spaceId: PERSONAL.id })],
      spaces: SPACES,
      features: { notifications: true, connections: true, admin: true },
      profileVersion: '3.5',
      snapshot: {
        admins: { [AGENT]: true },
        stewards: { [AGENT]: true },
        adminAccess: { [AGENT]: { roles: ['auditor'], grant: null } },
      },
    })
    expect(await menuOf(hub)).toEqual([
      'Notifications',
      'Linked devices',
      'Show archived conversations',
      'New space',
      'What Fleet support keeps about you',
      'Your accounts',
      'Spaces you steward',
      'Roles',
      'Show Admin',
      'Disconnect',
    ])
  })

  it('offers no Remove while the browser holds the pairing', async () => {
    const hub = await tab({ spaces: SPACES })
    const menu = await menuOf(hub)
    expect(menu).toContain('Disconnect')
    expect(menu).not.toContain('Remove')
    expect(menu).not.toContain('Reconnect')
  })

  it('offers no Remove while a session is bound, without the pairing: Disconnect instead', async () => {
    const hub = await tab({
      sessions: [record({ sessionId: 's1', spaceId: PERSONAL.id })],
      spaces: SPACES,
      snapshot: unpaired,
    })
    const menu = await menuOf(hub)
    expect(menu).toContain('Disconnect')
    expect(menu).not.toContain('Remove')
  })

  it('offers Reconnect and Remove while the browser is not linked, last, and no Disconnect', async () => {
    const hub = await tab({ spaces: SPACES, snapshot: unpaired })
    expect(await menuOf(hub)).toEqual(['Show archived conversations', 'New space', 'Reconnect', 'Remove'])
  })
})
