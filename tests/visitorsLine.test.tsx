/**
 * "This service lets visitors in." on the Proof of Trust card, the agent's page on the web (UI-TRUST-008): for an
 * agent whose descriptor declares `features.visitors` (PROF-DESC-012), and nothing of it for any other agent.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ProofOfTrust } from '../src/components/ProofOfTrust.js'
import { agentRecord, fakeAgent, render, setup, tab, teardown } from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

async function card(features: Record<string, unknown>) {
  fakeAgent([])
  const hub = await tab()
  return render(hub, <ProofOfTrust agent={agentRecord(features) as never} onClose={() => undefined} />)
}

describe('the trust card says when a service lets visitors in (UI-TRUST-008)', () => {
  it('shows the line for an agent that declares features.visitors, under the verdict', async () => {
    const el = await card({ visitors: true })
    const line = el.querySelector('.pot-visitors')
    expect(line?.textContent).toBe('This service lets visitors in.')
    // the descriptor says it: the line does not wait for the registry, and stands right under the verdict
    expect(line?.previousElementSibling?.classList.contains('pot-verdict')).toBe(true)
  })

  it.each([
    ['declares nothing of it', {}],
    ['declares false', { visitors: false }],
    ['declares something that is not true', { visitors: 'yes' }],
  ])('shows nothing of it for an agent that %s', async (_, features) => {
    const el = await card(features)
    expect(el.querySelector('.pot-visitors')).toBeNull()
    expect(el.textContent).not.toContain('visitors')
  })
})
