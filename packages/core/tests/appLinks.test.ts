import { describe, expect, it } from 'vitest'
import { destinationKey, hasWebRoute, isAppLink, parseAppLink } from '../src/appLinks.js'

const origin = 'https://app.dev.ayni.org'

describe('app links (AG-UI profile §10, UI-LINK-001/002)', () => {
  it('recognizes links on the app-link domain only', () => {
    expect(isAppLink('https://app.dev.ayni.org/app/explore', origin)).toBe(true)
    expect(isAppLink('/app/wallet', origin)).toBe(true)
    expect(isAppLink('https://app.ayni.org/app/explore', origin)).toBe(false)
    expect(isAppLink('https://app.dev.ayni.org/about', origin)).toBe(false)
    expect(isAppLink('not a url', origin)).toBe(false)
  })

  it('parses every path of the catalogue and reads only its parameters', () => {
    expect(parseAppLink('/app/home', origin)).toEqual({ path: 'home' })
    expect(parseAppLink('/app/home/did:webvh:x:acme', origin)).toEqual({ path: 'home', controller: 'did:webvh:x:acme' })
    expect(parseAppLink('/app/recent/feed', origin)).toEqual({ path: 'recent', segment: 'feed' })
    expect(parseAppLink('/app/scan', origin)).toEqual({ path: 'scan' })
    expect(parseAppLink('/app/explore?q=doctor&utm=stray', origin)).toEqual({ path: 'explore', q: 'doctor' })
    expect(parseAppLink('/app/explore/create', origin)).toEqual({ path: 'explore', create: true })
    expect(parseAppLink('/app/wallet/card/cred-1', origin)).toEqual({ path: 'wallet', segment: 'card', id: 'cred-1' })
    expect(parseAppLink('/app/wallet/send?to=verana1x&amount=5&memo=hi', origin)).toEqual({
      path: 'wallet',
      segment: 'send',
    })
    expect(parseAppLink('/app/service/did:webvh:x:svc', origin)).toEqual({ path: 'service', did: 'did:webvh:x:svc' })
    expect(parseAppLink('/app/settings/devices', origin)).toEqual({ path: 'settings', section: 'devices' })
    expect(parseAppLink('/app/connect?oob=abc', origin)).toEqual({ path: 'connect', oob: 'abc' })
    expect(parseAppLink('/app/unknown', origin)).toEqual({ path: 'unknown' })
    expect(parseAppLink('/app/wallet/nope', origin)).toEqual({ path: 'unknown' })
    expect(parseAppLink('/app/service/not-a-did', origin)).toEqual({ path: 'unknown' })
  })

  it('knows which destinations have a web route and names the others', () => {
    expect(hasWebRoute({ path: 'explore', q: 'x' })).toBe(true)
    expect(hasWebRoute({ path: 'settings', section: 'devices' })).toBe(true)
    expect(hasWebRoute({ path: 'settings', section: 'backup' })).toBe(false)
    expect(hasWebRoute({ path: 'wallet' })).toBe(false)
    expect(hasWebRoute({ path: 'explore', create: true })).toBe(false)
    expect(destinationKey({ path: 'wallet', segment: 'history' })).toBe('walletHistory')
    expect(destinationKey({ path: 'settings', section: 'backup' })).toBe('settingsBackup')
    expect(destinationKey({ path: 'scan' })).toBe('scan')
  })
})
