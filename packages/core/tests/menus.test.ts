/**
 * The agent's menu, one order and one set of words for the browser and the Ayni app (UI-AGENTS-009, APP-HOME-020):
 * the entries both offer in the app's order, with its words; Disconnect while connected; Reconnect and Remove only
 * while not; nothing read from the agent without the connection.
 */
import { describe, expect, it } from 'vitest'
import {
  AGENT_MENU_COPY,
  AGENT_MENU_DANGER,
  AGENT_MENU_ORDER,
  type AgentMenuKey,
  agentMenuOf,
  MENU_ICON,
} from '../src/index.js'

const words = (keys: AgentMenuKey[]) =>
  keys.map((key) => AGENT_MENU_COPY[`agentMenu.${key}`].replace('{{agent}}', 'Fleet support'))

/** What the app offers an agent it is connected to, every entry it has (ayni-app serviceMenu.ts). */
const APP_CONNECTED = {
  connected: true,
  notifications: true,
  devices: true,
  keeps: true,
  accounts: true,
  admin: 'showAdmin',
  signInMethods: true,
  authenticate: true,
  details: true,
} as const

describe("the agent's menu, the same in the browser and the app (UI-AGENTS-009)", () => {
  it("lists the app's entries in the app's order, with its words", () => {
    // the app's menu of a connected agent, as serviceMenu.ts lists it on the app's main branch
    expect(words(agentMenuOf(APP_CONNECTED))).toEqual([
      'Notifications',
      'Linked devices',
      'Show archived conversations',
      'What Fleet support keeps about you',
      'Your accounts',
      'Show Admin',
      'Sign-in methods',
      'Authenticate',
      'Disconnect',
      'Service details',
    ])
    expect(words(agentMenuOf({ ...APP_CONNECTED, connected: false }))).toEqual([
      'Linked devices',
      'Show archived conversations',
      'Reconnect',
      'Remove',
      'Service details',
    ])
  })

  it("puts the browser's own entries among the app's: New space after the conversations, Spaces you steward and Roles before Show Admin", () => {
    expect(
      agentMenuOf({
        connected: true,
        notifications: true,
        devices: true,
        archivedShown: true,
        newSpace: true,
        keeps: true,
        accounts: true,
        steward: true,
        roles: true,
        admin: 'hideAdmin',
      })
    ).toEqual([
      'notifications',
      'devices',
      'active',
      'newSpace',
      'keeps',
      'accounts',
      'steward',
      'roles',
      'hideAdmin',
      'disconnect',
    ])
  })

  it('offers Remove only while not connected, with Reconnect, and Disconnect only while connected', () => {
    const connected = agentMenuOf({ connected: true })
    expect(connected).toContain('disconnect')
    expect(connected).not.toContain('remove')
    expect(connected).not.toContain('reconnect')
    const not = agentMenuOf({ connected: false })
    expect(not).toEqual(['archived', 'reconnect', 'remove'])
  })

  it('offers nothing read from the agent, or asked of it, without the connection', () => {
    expect(agentMenuOf({ ...APP_CONNECTED, admin: 'hideAdmin', connected: false })).toEqual([
      'devices',
      'archived',
      'reconnect',
      'remove',
      'details',
    ])
  })

  it('gives every entry its words and its icon, and draws Disconnect and Remove in red', () => {
    for (const key of AGENT_MENU_ORDER) {
      expect(AGENT_MENU_COPY[`agentMenu.${key}`], key).toBeTruthy()
      expect(MENU_ICON[key], key).toBeTruthy()
    }
    expect([...AGENT_MENU_DANGER]).toEqual(['disconnect', 'remove'])
  })
})
