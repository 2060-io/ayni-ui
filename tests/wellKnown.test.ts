/**
 * The app-link association files (ayni-spec CC-WEB-001, app APP-LINK-001): rendered at container start for the
 * network's application identifier; this test is CI's verification that both files are valid for the app's ids.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function render(env: Record<string, string>) {
  const out = mkdtempSync(join(tmpdir(), 'ayni-well-known-'))
  execFileSync('sh', ['docker/render-well-known.sh', out], { env: { PATH: process.env.PATH ?? '', ...env } })
  return {
    aasa: JSON.parse(readFileSync(join(out, '.well-known/apple-app-site-association'), 'utf8')),
    assetlinks: JSON.parse(readFileSync(join(out, '.well-known/assetlinks.json'), 'utf8')),
  }
}

describe('app-link association files (CC-WEB-001)', () => {
  it('names the devnet app for Apple and Android with the signing fingerprints', () => {
    const { aasa, assetlinks } = render({
      APP_ID: 'org.ayni.app.dev',
      APPLE_TEAM_ID: 'Y5A6KQ62S7',
      ANDROID_CERT_FINGERPRINTS: 'AA:BB:CC, DD:EE:FF',
    })
    expect(aasa.applinks.details).toEqual([
      {
        appIDs: ['Y5A6KQ62S7.org.ayni.app.dev'],
        components: [{ '/': '/app/*', comment: 'Ayni app links (AG-UI profile 3.1 section 10)' }],
      },
    ])
    expect(assetlinks).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'org.ayni.app.dev',
          sha256_cert_fingerprints: ['AA:BB:CC', 'DD:EE:FF'],
        },
      },
    ])
  })

  it('stays valid JSON with no fingerprints yet and defaults to the mainnet id', () => {
    const { aasa, assetlinks } = render({ APPLE_TEAM_ID: 'Y5A6KQ62S7' })
    expect(aasa.applinks.details[0].appIDs).toEqual(['Y5A6KQ62S7.org.ayni.app'])
    expect(assetlinks[0].target).toEqual({
      namespace: 'android_app',
      package_name: 'org.ayni.app',
      sha256_cert_fingerprints: [],
    })
  })
})
