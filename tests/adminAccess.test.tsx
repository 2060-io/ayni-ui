/**
 * Admin access in the browser (profile 3.5.5 §3.14; agent D132, D133, ayni-agent #120; UI-ADMIN-001 to 006), in the tab
 * of Jonas Weber, who holds `auditor` (and, for Operations, `operator`), and of Ben, who holds neither: Show Admin and
 * Hide Admin in the agent's menu; "Confirm on your phone" and the outcome of a request that opened no grant; the ADMIN
 * area above the spaces exactly while the grant is open, which hides itself at its end and on Hide Admin, closing an
 * open page with "Admin access ended"; Audit, its reason asked first and carried by every read; Operations, each action
 * with a reason typed for it and a confirmation naming what it acts on; the words of the refusals in four languages.
 * The agent's answers are mocked as the agent of ayni-agent #120 gives them; nothing real is contacted.
 */
import { ADMIN_COPY } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AuditPage } from '../src/components/Audit.js'
import { Column } from '../src/components/Column.js'
import { OperationsPage } from '../src/components/Operations.js'
import en from '../src/i18n/en.json'
import es from '../src/i18n/es.json'
import fr from '../src/i18n/fr.json'
import pt from '../src/i18n/pt.json'
import type { Hub, Snapshot } from '../src/state/hub.js'
import { useSnapshot } from '../src/state/useHub.js'
import {
  AGENT,
  byText,
  type Call,
  click,
  fakeAgent,
  json,
  PERSONAL,
  record,
  render,
  settle,
  setup,
  space,
  tab,
  teardown,
  type,
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

type Route = [string | RegExp, (call: Call) => Response | Promise<Response>]
const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString()
const SALES = space({ id: 'spc_sales', title: 'Sales EU', lastActivityAt: '2026-11-20T09:00:00.000Z' })
const SPACES = { spaces: [PERSONAL, SALES], templates: [] }

/** The column and the main pane, as the shell lays them out for these pages. */
function Shell() {
  const snap = useSnapshot()
  return (
    <>
      <Column />
      <main className="main-pane">
        {snap.view === 'audit' ? <AuditPage /> : snap.view === 'operations' ? <OperationsPage /> : null}
      </main>
      {snap.notice ? (
        <div className="toast" role="status">
          {snap.notice.text}
        </div>
      ) : null}
    </>
  )
}

async function jonas(
  routes: Route[],
  options: { features?: Record<string, unknown>; snapshot?: Partial<Snapshot> } = {}
): Promise<{ hub: Hub; el: HTMLDivElement; calls: Call[] }> {
  const agent = fakeAgent(routes)
  const hub = await tab({
    features: options.features ?? { admin: true },
    sessions: [record({ sessionId: 's1' })],
    spaces: SPACES,
    snapshot: options.snapshot,
  })
  await hub.loadAdminAccess(AGENT)
  const el = await render(hub, <Shell />)
  return { hub, el, calls: agent.calls }
}

const openMenu = (el: HTMLElement) => click(el.querySelector('.agent-row [aria-label="Agent options"]'))
const menuEntry = (el: HTMLElement, text: string) => byText(el, '[role="menuitem"]', text)
const area = (el: HTMLElement) => el.querySelector<HTMLElement>('section.admin-area')
/** The lucide name of the icon drawn in an entry or a row: the core's table names it (MENU_ICON). */
const iconOf = (el: Element | null | undefined) =>
  [...(el?.querySelector('svg')?.classList ?? [])].find((c) => c.startsWith('lucide-'))?.slice('lucide-'.length)
const changed = (hub: Hub, value: unknown) =>
  // @ts-expect-error private: the event as a stream of the device delivers it
  hub.onEvent('s1', { type: 'CUSTOM', name: 'ayni.admin.changed', value }, undefined, false)

const AUDITOR: Route = ['GET /admin', () => json({ roles: ['auditor'], grant: null })]
const openGrant = (roles: string[], expiresAt = inMinutes(30)): Route => [
  'GET /admin',
  () => json({ roles, grant: { open: true, expiresAt } }),
]

describe("Show Admin and Hide Admin in the agent's menu (UI-ADMIN-001)", () => {
  it('offers Show Admin to Jonas, who holds auditor, with its icon', async () => {
    const { el, calls } = await jonas([AUDITOR])
    expect(calls.some((c) => c.method === 'GET' && c.url.endsWith('/admin'))).toBe(true)
    await openMenu(el)
    const entry = menuEntry(el, 'Show Admin')
    expect(entry).toBeDefined()
    // the icon of the core's table, the same in the app (MENU_ICON.showAdmin)
    expect(iconOf(entry)).toBe('shield-user')
    expect(menuEntry(el, 'Hide Admin')).toBeUndefined()
  })

  it('offers nothing to Ben, who holds no admin role', async () => {
    const { el } = await jonas([['GET /admin', () => json({ roles: [] })]])
    await openMenu(el)
    expect(menuEntry(el, 'Show Admin')).toBeUndefined()
    expect(menuEntry(el, 'Hide Admin')).toBeUndefined()
  })

  it('offers nothing, and asks nothing, for an agent that does not declare features.admin', async () => {
    const { el, calls } = await jonas([AUDITOR], { features: {} })
    expect(calls.some((c) => c.url.endsWith('/admin'))).toBe(false)
    await openMenu(el)
    expect(menuEntry(el, 'Show Admin')).toBeUndefined()
  })

  it('reads Hide Admin while the grant is open', async () => {
    const { el } = await jonas([openGrant(['auditor'])])
    await openMenu(el)
    expect(menuEntry(el, 'Hide Admin')).toBeDefined()
    expect(iconOf(menuEntry(el, 'Hide Admin'))).toBe('shield-off')
    expect(menuEntry(el, 'Show Admin')).toBeUndefined()
  })
})

describe('Show Admin waits for the phone (UI-ADMIN-002)', () => {
  const requested: Route = ['POST /admin/grant', () => json({ requestId: 'admreq_1', expiresAt: inMinutes(15) }, 202)]

  it('reads "Confirm on your phone", then "Not confirmed on your phone" when declined, and no area shows', async () => {
    const { hub, el, calls } = await jonas([AUDITOR, requested])
    await openMenu(el)
    await click(menuEntry(el, 'Show Admin'))
    await until(() => el.textContent?.includes('Confirm on your phone'))
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/admin/grant'))).toHaveLength(1)
    await changed(hub, { roles: ['auditor'], grant: null, outcome: 'declined' })
    await settle()
    expect(el.textContent).toContain('Not confirmed on your phone')
    expect(el.textContent).not.toContain('Confirm on your phone')
    expect(area(el)).toBeNull()
    // the words leave the card, which stays as it was
    await click(el.querySelector('.admin-request [aria-label="Close"]'))
    expect(el.querySelector('.admin-request')).toBeNull()
    await openMenu(el)
    expect(menuEntry(el, 'Show Admin')).toBeDefined()
  })

  it('reads "The request expired" when the phone did not answer in time', async () => {
    const { hub, el } = await jonas([AUDITOR, requested])
    await openMenu(el)
    await click(menuEntry(el, 'Show Admin'))
    await until(() => el.textContent?.includes('Confirm on your phone'))
    await changed(hub, { roles: ['auditor'], grant: null, outcome: 'expired' })
    await settle()
    expect(el.textContent).toContain('The request expired')
    expect(area(el)).toBeNull()
  })

  it('once confirmed, shows the ADMIN area above the spaces, and the entry reads Hide Admin', async () => {
    const { hub, el } = await jonas([AUDITOR, requested])
    await openMenu(el)
    await click(menuEntry(el, 'Show Admin'))
    await until(() => el.textContent?.includes('Confirm on your phone'))
    const expiresAt = inMinutes(30)
    await changed(hub, { roles: ['auditor'], grant: { open: true, expiresAt }, outcome: 'opened' })
    await settle()
    expect(el.querySelector('.admin-request')).toBeNull()
    const admin = area(el)
    expect(admin).not.toBeNull()
    expect(admin?.querySelector('.section-label')?.textContent).toContain('Admin')
    const time = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(expiresAt))
    expect(admin?.textContent).toContain(`Until ${time}`)
    expect(byText(admin as HTMLElement, '.space-name', 'Audit')).toBeDefined()
    expect(byText(admin as HTMLElement, '.space-name', 'Operations')).toBeUndefined()
    // above the spaces
    const spaces = [...el.querySelectorAll('.space-rows')]
    expect(spaces[0]).toBe(admin)
    expect(spaces.length).toBe(2)
    await openMenu(el)
    expect(menuEntry(el, 'Hide Admin')).toBeDefined()
  })
})

describe('the ADMIN area, exactly while the grant is open (UI-ADMIN-003)', () => {
  it('shows Audit and Operations to a holder of both, each opening its page with no further question', async () => {
    const { hub, el } = await jonas([openGrant(['auditor', 'operator'])])
    const admin = area(el) as HTMLElement
    expect([...admin.querySelectorAll('.space-name')].map((n) => n.textContent)).toEqual(['Audit', 'Operations'])
    // each row with the icon of the core's table, the same in the app (MENU_ICON.audit, MENU_ICON.operations)
    expect([...admin.querySelectorAll('.space-row')].map(iconOf)).toEqual(['file-search', 'wrench'])
    await click(byText(admin, '.space-row', 'Audit'))
    expect(hub.getSnapshot().view).toBe('audit')
    expect(el.querySelector('.audit-page h1')?.textContent).toBe('Audit')
    await click(byText(area(el) as HTMLElement, '.space-row', 'Operations'))
    expect(hub.getSnapshot().view).toBe('operations')
    expect(el.querySelector('.operations-page h1')?.textContent).toBe('Operations')
  })

  it('hides itself at expiresAt by the browser clock, and the open Audit page closes with "Admin access ended"', async () => {
    const { hub, el } = await jonas([openGrant(['auditor'], new Date(Date.now() + 400).toISOString())])
    expect(area(el)).not.toBeNull()
    await click(byText(area(el) as HTMLElement, '.space-row', 'Audit'))
    expect(hub.getSnapshot().view).toBe('audit')
    await until(() => area(el) === null, 3000)
    expect(hub.getSnapshot().view).toBe('list')
    expect(el.querySelector('.audit-page')).toBeNull()
    expect(el.querySelector('.toast')?.textContent).toBe('Admin access ended')
  })

  it('hides itself on ayni.admin.changed ending the grant', async () => {
    const { hub, el } = await jonas([openGrant(['auditor'])])
    await click(byText(area(el) as HTMLElement, '.space-row', 'Audit'))
    await changed(hub, { roles: ['auditor'], grant: null, outcome: 'ended' })
    await settle()
    expect(area(el)).toBeNull()
    expect(hub.getSnapshot().view).toBe('list')
    expect(el.querySelector('.toast')?.textContent).toBe('Admin access ended')
  })

  it('Hide Admin ends the grant at once: the area hides and the page closes', async () => {
    const { hub, el, calls } = await jonas([
      openGrant(['operator']),
      ['DELETE /admin/grant', () => new Response(null, { status: 204 })],
    ])
    await click(byText(area(el) as HTMLElement, '.space-row', 'Operations'))
    await openMenu(el)
    await click(menuEntry(el, 'Hide Admin'))
    await until(() => area(el) === null)
    expect(calls.filter((c) => c.method === 'DELETE' && c.url.endsWith('/admin/grant'))).toHaveLength(1)
    expect(hub.getSnapshot().view).toBe('list')
    expect(el.querySelector('.toast')?.textContent).toBe('Admin access ended')
    await openMenu(el)
    expect(menuEntry(el, 'Show Admin')).toBeDefined()
  })
})

describe('Audit (UI-ADMIN-004, UI-ADMIN-006)', () => {
  const CONVERSATION = {
    id: 'conv_88',
    principalId: 'prn_ana',
    spaceId: 'spc_sales',
    title: 'Order 88',
    state: 'active',
    createdAt: '2026-11-18T09:00:00.000Z',
    lastActivityAt: '2026-11-19T09:00:00.000Z',
  }
  const MESSAGES = [
    { id: 'ent_1', role: 'user', content: '[erased]', metadata: { createdAt: '2026-11-18T09:00:00.000Z' } },
    {
      id: 'ent_2',
      role: 'assistant',
      content: 'The order ships Monday.',
      metadata: { createdAt: '2026-11-18T09:01:00.000Z' },
    },
  ]
  const PEOPLE = [
    { principalId: 'prn_ana', name: 'Ana Ruiz', department: 'Sales' },
    { principalId: 'prn_anabel', name: 'Anabel Costa', department: null },
  ]
  const audit = (extra: Route[] = []) =>
    jonas([
      openGrant(['auditor']),
      ...extra,
      [
        /^GET \/admin\/audit\/people\?/,
        (call) => {
          const q = (new URL(call.url).searchParams.get('q') ?? '').toLowerCase()
          return json({ people: PEOPLE.filter((p) => p.name.toLowerCase().includes(q)) })
        },
      ],
      [
        /^GET \/admin\/audit\/evidence\?/,
        () =>
          json({ evidence: [{ record: { id: 'evd_1', kind: 'email' }, values: { email: 'ana@x' } }], auditId: 'e' }),
      ],
      [
        /^GET \/admin\/audit\/tool-calls\?/,
        () => json({ calls: [{ id: 'call_1', principalId: 'prn_ana', toolName: 'crm.lookup' }], auditId: 'c' }),
      ],
      [/^GET \/admin\/audit\/conversations\?/, () => json({ conversations: [CONVERSATION], auditId: 'adm_1' })],
      [
        /^GET \/admin\/audit\/conversations\/conv_88\/messages\?/,
        () => json({ messages: MESSAGES, nextBefore: null, auditId: 'adm_2' }),
      ],
      [
        /^GET \/admin\/audit\/log\?/,
        () =>
          json({
            records: [
              {
                id: 'adm_2',
                ts: '2026-11-24T10:00:00.000Z',
                action: 'audit-read',
                actor: 'prn_jonas',
                reason: 'Complaint 4411',
                detail: { what: 'messages' },
              },
            ],
            nextBefore: null,
            auditId: 'adm_3',
          }),
      ],
    ])

  it('asks a reason before its first read, keeps it, and every read carries it', async () => {
    const { el, calls, hub } = await audit()
    await click(byText(area(el) as HTMLElement, '.space-row', 'Audit'))
    const reads = () => calls.filter((c) => c.url.includes('/admin/audit/'))
    // nothing is read before the reason
    expect(el.querySelector('.audit-reason-form')).not.toBeNull()
    expect(el.querySelector('[role="tablist"]')).toBeNull()
    const go = byText(el, 'button', 'Continue') as HTMLButtonElement
    expect(go.disabled).toBe(true)
    await type(el.querySelector('.admin-reason'), 'Complaint 4411')
    await click(go)
    expect(el.querySelector('.audit-reason')?.textContent).toContain('Reason: Complaint 4411')
    expect(reads()).toHaveLength(0)
    // Ana's conversations of Sales EU for a week: Ana found by her name, with the reason
    const fields = el.querySelectorAll<HTMLInputElement>('.audit-filters input')
    expect(fields[0].classList.contains('person-search')).toBe(true)
    await type(fields[0], 'ana r')
    await until(() => el.querySelector('.person-option') !== null)
    const search = new URL(reads()[0].url)
    expect(search.pathname.endsWith('/admin/audit/people')).toBe(true)
    expect(search.searchParams.get('q')).toBe('ana r')
    expect(search.searchParams.get('reason')).toBe('Complaint 4411')
    await click(byText(el, '.person-option', /Ana Ruiz/))
    expect(el.querySelector('.person-chosen')?.textContent).toBe('Ana RuizSales')
    await type(fields[1], 'spc_sales')
    await type(fields[2], '2026-11-16')
    await type(fields[3], '2026-11-22')
    await click(byText(el, 'button', 'Find'))
    await until(() => el.textContent?.includes('Order 88'))
    const query = new URL(reads()[1].url).searchParams
    expect(query.get('principal')).toBe('prn_ana')
    expect(query.get('space')).toBe('spc_sales')
    expect(new Date(query.get('from') as string).getDate()).toBe(16)
    expect(new Date(query.get('to') as string).getDate()).toBe(22)
    expect(query.get('reason')).toBe('Complaint 4411')
    // the row names the person picked by her name, and its space by the title the auditor knows
    expect(el.textContent).toContain('Ana Ruiz · Sales EU')
    // its messages, decrypted, as a transcript nothing can be written to
    await click(byText(el, '.audit-row', /Order 88/))
    await until(() => el.textContent?.includes('The order ships Monday.'))
    expect(new URL(reads()[2].url).searchParams.get('reason')).toBe('Complaint 4411')
    expect(el.textContent).toContain('[erased]')
    expect(el.textContent).toContain('Entry ent_2')
    expect(el.querySelector('.audit-page textarea, .audit-page .composer')).toBeNull()
    // the admin audit, newest first, with the same reason
    await click(byText(el, '[role="tab"]', 'Admin audit'))
    await until(() => el.querySelector('.audit-log') !== null)
    expect(new URL(reads()[3].url).searchParams.get('reason')).toBe('Complaint 4411')
    expect(el.querySelector('.audit-log')?.textContent).toContain('Reason: Complaint 4411')
    // the reason is kept for the grant's next reads, and changed with Change
    expect(hub.auditReasonOf(AGENT)).toBe('Complaint 4411')
    await click(byText(el, 'button', 'Change'))
    await type(el.querySelector('.admin-reason'), 'Complaint 4412')
    await click(byText(el, 'button', 'Continue'))
    await until(() => reads().length === 5)
    expect(new URL(reads()[4].url).searchParams.get('reason')).toBe('Complaint 4412')
  })

  const withReason = async (el: HTMLElement) => {
    await click(byText(area(el) as HTMLElement, '.space-row', 'Audit'))
    await type(el.querySelector('.admin-reason'), 'Complaint 4411')
    await click(byText(el, 'button', 'Continue'))
  }

  it('reads the evidence of a person picked by name, never of an id typed: Read waits for the pick', async () => {
    const { el, calls } = await audit()
    await withReason(el)
    await click(byText(el, '[role="tab"]', 'Evidence'))
    const read = byText(el, 'button', 'Read') as HTMLButtonElement
    expect(read.disabled).toBe(true)
    // the field takes a name: typing an id picks no one
    await type(el.querySelector('.person-search'), 'prn_ana')
    await until(() => el.querySelector('.person-none') !== null)
    expect(el.querySelector('.person-none')?.textContent).toBe('No one by that name.')
    expect(read.disabled).toBe(true)
    await type(el.querySelector('.person-search'), 'Ana')
    await until(() => el.querySelectorAll('.person-option').length === 2)
    // each one found by name and department
    expect([...el.querySelectorAll('.person-option')].map((o) => o.textContent)).toEqual([
      'Ana RuizSales',
      'Anabel Costa',
    ])
    await click(byText(el, '.person-option', /Anabel Costa/))
    expect(el.querySelector('.person-search')).toBeNull()
    expect((byText(el, 'button', 'Read') as HTMLButtonElement).disabled).toBe(false)
    await click(byText(el, 'button', 'Read'))
    await until(() => el.textContent?.includes('ana@x'))
    const evidence = calls.find((c) => c.url.includes('/admin/audit/evidence?')) as Call
    expect(new URL(evidence.url).searchParams.get('principal')).toBe('prn_anabel')
    expect(new URL(evidence.url).searchParams.get('reason')).toBe('Complaint 4411')
    // another person: the field is a name to type again
    await click(el.querySelector('.person-chosen [aria-label="Choose another person"]'))
    expect((el.querySelector('.person-search') as HTMLInputElement).value).toBe('')
    expect((byText(el, 'button', 'Read') as HTMLButtonElement).disabled).toBe(true)
  })

  it('filters the call records by the person picked, named in the table by her name', async () => {
    const { el, calls } = await audit()
    await withReason(el)
    await click(byText(el, '[role="tab"]', 'Call records'))
    await type(el.querySelector('.person-search'), 'Ruiz')
    await until(() => el.querySelector('.person-option') !== null)
    await click(byText(el, '.person-option', /Ana Ruiz/))
    await click(byText(el, 'button', 'Find'))
    await until(() => el.querySelector('.audit-table') !== null)
    const read = calls.find((c) => c.url.includes('/admin/audit/tool-calls?')) as Call
    expect(new URL(read.url).searchParams.get('principal')).toBe('prn_ana')
    expect(el.querySelector('.audit-table tbody')?.textContent).toContain('Ana Ruiz')
  })

  it('searches nothing for an empty name, and once per pause in the typing', async () => {
    const { el, calls } = await audit()
    await withReason(el)
    const searches = () => calls.filter((c) => c.url.includes('/admin/audit/people?'))
    await type(el.querySelector('.person-search'), '   ')
    await settle()
    await new Promise((r) => setTimeout(r, 400))
    expect(searches()).toHaveLength(0)
    await type(el.querySelector('.person-search'), 'A')
    await type(el.querySelector('.person-search'), 'An')
    await type(el.querySelector('.person-search'), 'Ana')
    await until(() => el.querySelector('.person-option') !== null)
    expect(searches().map((c) => new URL(c.url).searchParams.get('q'))).toEqual(['Ana'])
  })

  it('says "You don\'t have this role any more" when the search for a person answers not-auditor', async () => {
    const { el } = await audit([[/^GET \/admin\/audit\/people\?/, () => json({ error: 'not-auditor' }, 403)]])
    await withReason(el)
    await type(el.querySelector('.person-search'), 'Ana')
    await until(() => el.querySelector('.person-picker .admin-error') !== null)
    expect(el.querySelector('.person-picker .admin-error')?.textContent?.trim()).toBe(
      "You don't have this role any more"
    )
  })

  it('says the words of the person picker in every language', () => {
    for (const words of [en, es, fr, pt]) {
      const page = words.adminAccess.auditPage as Record<string, unknown>
      for (const key of ['person', 'personHint', 'people', 'noPeople', 'otherPerson'])
        expect(typeof page[key], key).toBe('string')
      // the field names a person, not an id to type
      expect(String(page.person)).not.toMatch(/Principal/)
    }
  })

  it('says "You don\'t have this role any more" when the agent answers not-auditor', async () => {
    const { el } = await audit([[/^GET \/admin\/audit\/log\?/, () => json({ error: 'not-auditor' }, 403)]])
    await click(byText(area(el) as HTMLElement, '.space-row', 'Audit'))
    await type(el.querySelector('.admin-reason'), 'Complaint 4411')
    await click(byText(el, 'button', 'Continue'))
    await click(byText(el, '[role="tab"]', 'Admin audit'))
    await until(() => el.querySelector('.admin-error') !== null)
    expect(el.querySelector('.admin-error')?.textContent?.trim()).toBe("You don't have this role any more")
  })

  it('closes with "Admin access ended" when the agent answers admin-closed', async () => {
    const { el, hub } = await audit([[/^GET \/admin\/audit\/log\?/, () => json({ error: 'admin-closed' }, 403)]])
    await click(byText(area(el) as HTMLElement, '.space-row', 'Audit'))
    await type(el.querySelector('.admin-reason'), 'Complaint 4411')
    await click(byText(el, 'button', 'Continue'))
    await click(byText(el, '[role="tab"]', 'Admin audit'))
    await until(() => hub.getSnapshot().view === 'list')
    expect(area(el)).toBeNull()
    expect(el.querySelector('.toast')?.textContent).toBe('Admin access ended')
  })
})

describe('Operations (UI-ADMIN-005, UI-ADMIN-006)', () => {
  const KEYS = {
    keys: [
      { key: 'master', versions: [{ version: 1, current: true, wraps: null }], rotation: null, rotatable: false },
      {
        key: 'index',
        versions: [{ version: 2, current: true, wraps: 40 }],
        rotation: { from: 1, to: 2, done: 40, total: 100 },
        rotatable: true,
      },
    ],
    keyService: null,
    auditId: 'adm_9',
  }
  const operations = (extra: Route[] = []) =>
    jonas([
      openGrant(['operator']),
      ...extra,
      [
        'POST /admin/operations/erase',
        () => json({ erased: ['ent_1', 'ent_2'], held: [], notFound: [], auditId: 'a' }),
      ],
      ['POST /admin/operations/legal-hold', () => json({ changed: ['ent_1', 'ent_2'], skipped: [], auditId: 'b' })],
      [/^GET \/admin\/operations\/keys\?/, () => json(KEYS)],
      ['POST /admin/operations/keys/index/rotate', () => json({ error: 'not-implemented' }, 501)],
    ])
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')

  it('erases an entry with a reason typed for it and a confirmation that names it', async () => {
    const { el, calls } = await operations()
    await click(byText(area(el) as HTMLElement, '.space-row', 'Operations'))
    const section = el.querySelector<HTMLElement>('[aria-label="Erase entries"]') as HTMLElement
    await type(section.querySelector('textarea'), 'ent_1')
    await click(byText(section, 'button', 'Erase'))
    expect(dialog()?.textContent).toContain('Entries: ent_1')
    const confirm = dialog()?.querySelector<HTMLButtonElement>('.operation-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    expect(calls.some((c) => c.url.includes('/operations/'))).toBe(false)
    await type(dialog()?.querySelector('.admin-reason'), 'GDPR request 17')
    await click(confirm)
    await until(() => section.textContent?.includes('Erased: ent_1, ent_2'))
    const erase = calls.find((c) => c.url.endsWith('/admin/operations/erase'))
    expect(erase?.body).toEqual({ entryIds: ['ent_1'], reason: 'GDPR request 17' })
    expect(dialog()).toBeNull()
  })

  it('sets a legal hold on a conversation, naming it in the confirmation', async () => {
    const { el, calls } = await operations()
    await click(byText(area(el) as HTMLElement, '.space-row', 'Operations'))
    const section = el.querySelector<HTMLElement>('[aria-label="Legal hold"]') as HTMLElement
    await click(byText(section, 'label', 'A conversation')?.querySelector('input'))
    await type(section.querySelector('input:not([type="radio"])'), 'conv_88')
    await click(byText(section, 'button', 'Set a legal hold'))
    expect(dialog()?.textContent).toContain('Every entry of the conversation conv_88')
    await type(dialog()?.querySelector('.admin-reason'), 'Litigation 9')
    await click(dialog()?.querySelector('.operation-confirm'))
    await until(() => section.textContent?.includes('Changed: ent_1, ent_2'))
    expect(calls.find((c) => c.url.endsWith('/legal-hold'))?.body).toEqual({
      conversationId: 'conv_88',
      hold: true,
      reason: 'Litigation 9',
    })
  })

  it("reads the keys with a reason, shows a rotation's progress, and says a rotation the agent cannot do", async () => {
    const { el, calls } = await operations()
    await click(byText(area(el) as HTMLElement, '.space-row', 'Operations'))
    const section = el.querySelector<HTMLElement>('[aria-label="Keys"]') as HTMLElement
    const show = byText(section, 'button', 'Show the keys') as HTMLButtonElement
    expect(show.disabled).toBe(true)
    await type(section.querySelector('.admin-reason'), 'Quarterly check')
    await click(show)
    await until(() => section.textContent?.includes('Index key'))
    expect(
      new URL(calls.find((c) => c.url.includes('/operations/keys?'))?.url as string).searchParams.get('reason')
    ).toBe('Quarterly check')
    expect(section.textContent).toContain('From version 1 to 2: 40 of 100')
    const rotates = [...section.querySelectorAll<HTMLButtonElement>('.keys-table button')]
    // the master key cannot be rotated by this agent; the index key can be asked
    expect(rotates.map((b) => b.disabled)).toEqual([true, false])
    await click(rotates[1])
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Rotate the index key')
    await type(dialog()?.querySelector('.admin-reason'), 'Key compromise drill')
    await click(dialog()?.querySelector('.operation-confirm'))
    await until(() => dialog()?.querySelector('.admin-error') != null)
    expect(dialog()?.querySelector('.admin-error')?.textContent?.trim()).toBe('This agent cannot rotate it yet.')
    expect(calls.find((c) => c.url.endsWith('/keys/index/rotate'))?.body).toEqual({ reason: 'Key compromise drill' })
  })

  it('says "Say why you need this" when the agent answers reason-required', async () => {
    const { el } = await operations([
      ['POST /admin/operations/erase', () => json({ error: 'reason-required', message: 'say why you need this' }, 400)],
    ])
    await click(byText(area(el) as HTMLElement, '.space-row', 'Operations'))
    const section = el.querySelector<HTMLElement>('[aria-label="Erase entries"]') as HTMLElement
    await type(section.querySelector('textarea'), 'ent_1')
    await click(byText(section, 'button', 'Erase'))
    await type(dialog()?.querySelector('.admin-reason'), 'x1')
    await click(dialog()?.querySelector('.operation-confirm'))
    await until(() => dialog()?.querySelector('.admin-error') != null)
    expect(dialog()?.querySelector('.admin-error')?.textContent?.trim()).toBe('Say why you need this')
  })
})

describe('the words of admin access in the four languages', () => {
  type Tree = { [key: string]: string | Tree }
  const pathOf = (tree: Tree, path: string): unknown =>
    path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree)
  const leaves = (tree: Tree, prefix = ''): string[] =>
    Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : leaves(v, `${prefix}${k}.`)))
  const names = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

  it('say in English what the core gives the app', () => {
    for (const [path, text] of Object.entries(ADMIN_COPY)) expect(pathOf(en as Tree, path), path).toBe(text)
  })

  it('give every text in the other three, with what the screen puts in', () => {
    for (const path of leaves((en as Tree).adminAccess as Tree, 'adminAccess.')) {
      const text = pathOf(en as Tree, path) as string
      for (const [lang, tree] of Object.entries({ es, fr, pt })) {
        const other = pathOf(tree as Tree, path) as string
        expect(other, `${lang}.${path}`).toBeTruthy()
        expect(names(other), `${lang}.${path}`).toEqual(names(text))
      }
    }
  })
})
