/** The device store moves the records of the pre-rename database over once (D14). */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'
import { IndexedDbStore } from '../src/store.js'

async function seedLegacy() {
  const legacy = await openDB('hologram-ui', 2, {
    upgrade(db) {
      db.createObjectStore('agents', { keyPath: 'did' })
      db.createObjectStore('sessions', { keyPath: 'sessionId' }).createIndex('byAgent', 'agentDid')
      db.createObjectStore('transcripts', { keyPath: 'sessionId' })
      db.createObjectStore('meta', { keyPath: 'key' })
      db.createObjectStore('controllers', { keyPath: 'did' })
    },
  })
  await legacy.put('agents', { did: 'did:web:a', name: 'A', deviceHandle: 'dev_1', deviceSecret: 'dsk_1' })
  await legacy.put('sessions', { sessionId: 'ses_1', agentDid: 'did:web:a', title: 'hello' })
  await legacy.put('transcripts', { sessionId: 'ses_1', messages: [{ id: 'm1', role: 'user', content: 'hi' }] })
  await legacy.put('meta', { key: 'deviceId', value: 'device-old' })
  await legacy.put('controllers', { did: 'org:ee:1', kind: 'organization', name: 'Org' })
  legacy.close()
}

describe('store migration from the previous database name', () => {
  beforeEach(() => {
    // a fresh factory per test: connections left open by a previous test cannot block a delete
    ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  })

  it('copies agents, sessions, transcripts, controllers and the device id, then drops the old database', async () => {
    await seedLegacy()
    const store = new IndexedDbStore()
    expect((await store.listAgents()).map((a) => a.did)).toEqual(['did:web:a'])
    expect((await store.getAgent('did:web:a'))?.deviceSecret).toBe('dsk_1')
    expect((await store.listSessions('did:web:a')).map((s) => s.sessionId)).toEqual(['ses_1'])
    expect((await store.getTranscript('ses_1'))?.messages.length).toBe(1)
    expect((await store.listControllers()).length).toBe(1)
    expect(await store.deviceId()).toBe('device-old')
    const names = (await indexedDB.databases()).map((d) => d.name)
    expect(names).not.toContain('hologram-ui')
  })

  it('leaves a populated new store alone', async () => {
    const store = new IndexedDbStore()
    await store.putAgent({ did: 'did:web:new' } as never)
    await seedLegacy()
    const again = new IndexedDbStore()
    expect((await again.listAgents()).map((a) => a.did)).toEqual(['did:web:new'])
  })

  it('is a no-op without an old database', async () => {
    const store = new IndexedDbStore()
    expect(await store.listAgents()).toEqual([])
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain('hologram-ui')
  })
})
