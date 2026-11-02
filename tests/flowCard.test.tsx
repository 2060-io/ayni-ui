/** Renders flow cards in jsdom: the pending text of the kind, then the outcome and preview (UI-CONV-021, UI-CAP-005). */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { FlowCard } from '../src/components/Cards.js'
import { initI18n } from '../src/i18n/index.js'

let root: Root | undefined
let host: HTMLDivElement | undefined

beforeAll(() => {
  initI18n(['en'], 'en', 'en')
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
})

function render(element: React.ReactElement): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(element))
  return host
}

describe('flow card', () => {
  it('shows the pending text of its kind while open', () => {
    const el = render(
      <FlowCard
        flow={{ flowId: 'f1', kind: 'present', state: 'pending', title: 'Prove you are an employee', openedAt: '' }}
      />
    )
    expect(el.textContent).toContain('Share a credential')
    expect(el.textContent).toContain('Share a credential on your phone')
    expect(el.textContent).toContain('Prove you are an employee')
  })

  it('shows a received credential with its claims and the wallet hint once completed', () => {
    const el = render(
      <FlowCard
        flow={{
          flowId: 'f2',
          kind: 'issue',
          state: 'completed',
          outcome: 'completed',
          title: 'Your employee badge',
          openedAt: '',
          preview: { claims: { name: 'Ana Ruiz', department: 'Support' } },
          references: [{ type: 'credential', id: 'cred-1' }],
        }}
      />
    )
    expect(el.textContent).toContain('Credential received')
    expect(el.textContent).toContain('Ana Ruiz')
    expect(el.textContent).toContain('Department')
    expect(el.textContent).toContain('Open it in your wallet on your phone')
  })

  it('shows a confirmation with its attestation method, and a declined flow as declined', () => {
    const confirmed = render(
      <FlowCard
        flow={{
          flowId: 'f3',
          kind: 'confirm',
          state: 'completed',
          outcome: 'completed',
          title: 'Confirm: Wire 100 EUR',
          openedAt: '',
          preview: { confirmed: true, attestation: { method: 'biometric', at: '' } },
        }}
      />
    )
    expect(confirmed.textContent).toContain('Confirmed')
    expect(confirmed.textContent).toContain('verified with biometrics')
    act(() => root?.unmount())
    host?.remove()
    const declined = render(
      <FlowCard
        flow={{
          flowId: 'f4',
          kind: 'present',
          state: 'declined',
          outcome: 'declined',
          title: 'Prove it',
          openedAt: '',
        }}
      />
    )
    expect(declined.textContent).toContain('Declined')
  })
})
