/** A controller joins the identified group once, with a notice, when its agent issues a credential (UI-SHELL-011, D37). */
import { MemoryDeviceStore } from '@ayni.org/ayni-ui-core'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../src/i18n/index.js'
import { Hub } from '../src/state/hub.js'

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

beforeAll(() => {
  initI18n(['en'], 'en', 'en')
})

describe('identified controllers (D37)', () => {
  it('marks the controller once and notifies, then stays quiet', async () => {
    const hub = new Hub(config, { appName: 'Ayni' })
    const store = new MemoryDeviceStore()
    // @ts-expect-error private: the hub works on the in-memory store, with nothing on the network
    hub.store = store
    await store.putController({ did: 'did:acme', kind: 'organization', name: 'Acme', pinned: false, pinOrder: 0 })
    await store.putAgent({
      did: 'did:agent',
      descriptorUrl: 'http://agent.test/agui',
      descriptor: {
        did: 'did:agent',
        name: 'Acme Support',
        profileVersion: '3.1',
        sessions: 'http://agent.test/s',
        features: {},
      },
      name: 'Acme Support',
      trust: {
        result: 'trusted',
        checkedAt: '',
        did: 'did:agent',
        reasons: [],
        operator: { kind: 'org', name: 'Acme' },
      },
      controllerDid: 'did:acme',
      pinned: false,
      pinOrder: 0,
      addedAt: '2026-01-01T00:00:00.000Z',
      lastMessageAt: '',
    } as never)
    await hub.reload()
    expect(await hub.markIdentified('did:agent')).toBe(true)
    const [controller] = await store.listControllers()
    expect(controller.identifiedAt).toBeTruthy()
    expect(hub.getSnapshot().notice?.text).toContain('Acme')
    expect(await hub.markIdentified('did:agent')).toBe(false) // once
    expect(await hub.markIdentified('did:unknown')).toBe(false)
  })
})
