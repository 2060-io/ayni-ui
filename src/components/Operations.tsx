/**
 * Operations (UI-ADMIN-005, UI-ADMIN-006; profile 3.5.5 §3.14, PROF-ADMIN-006; agent D133): for an `operator` while the
 * browser's grant is open, opened from the ADMIN area of the agent's card. Each action asks a reason typed for it and a
 * confirmation that names what it acts on: erase entries; set or release a legal hold on entries or on a conversation;
 * rotate the master key or the index key. The keys' versions and the progress of a rotation are a read, with its own
 * reason. Each answer says what was done.
 */
import {
  type AdminKeyName,
  type AgentRecord,
  adminReasonFits,
  entryIdsOf,
  type KeysResponse,
  ProfileError,
} from '@ayni.org/ayni-ui-core'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { AdminError, AdminHeader, adminErrorWords, ReasonField } from './Audit.js'
import { Dialog } from './Dialog.js'

export function OperationsPage() {
  const snap = useSnapshot()
  const { t } = useTranslation()
  const agent = snap.agents.find((a) => a.did === snap.adminPageFor)
  if (!agent) return <div className="center" />
  return (
    <div className="admin-page operations-page">
      <AdminHeader agent={agent} title={t('adminAccess.operations')} />
      <div className="space-body">
        <EraseSection agent={agent} />
        <LegalHoldSection agent={agent} />
        <KeysSection agent={agent} />
      </div>
    </div>
  )
}

/**
 * The confirmation of an action (UI-ADMIN-005): it names what the action acts on and asks the reason typed for it; the
 * action runs only with a reason the agent takes.
 */
function ConfirmAction({
  title,
  target,
  action,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string
  /** what it acts on, in words */
  target: string
  /** the words of the button that does it */
  action: string
  danger?: boolean
  onCancel: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!adminReasonFits(reason)) return
    setBusy(true)
    setError('')
    try {
      await onConfirm(reason.trim())
    } catch (err) {
      setError(adminErrorWords(err, t))
      setBusy(false)
    }
  }
  return (
    <Dialog title={title} onClose={onCancel}>
      <form className="dialog-form" onSubmit={(e) => void submit(e)}>
        <p className="operation-target">{target}</p>
        <ReasonField value={reason} onChange={setReason} />
        <AdminError text={error} />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {t('app.cancel')}
          </button>
          <button
            type="submit"
            className={danger ? 'btn danger operation-confirm' : 'btn primary operation-confirm'}
            disabled={busy || !adminReasonFits(reason)}
          >
            {action}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/** What an action did, line by line; nothing for an empty list. */
function Outcome({ lines }: { lines: [string, string[]][] }) {
  const { t } = useTranslation()
  const shown = lines.filter(([, ids]) => ids.length)
  return (
    <div className="operation-outcome" role="status">
      {shown.length
        ? shown.map(([key, ids]) => <div key={key}>{t(key, { ids: ids.join(', ') })}</div>)
        : t('adminAccess.operationsPage.nothingChanged')}
    </div>
  )
}

/** Erase entries, with their cascade; a legal hold keeps an entry (PRIV-ERASE-008). */
function EraseSection({ agent }: { agent: AgentRecord }) {
  const hub = useHub()
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState<string[] | null>(null)
  const [done, setDone] = useState<{ erased: string[]; held: string[]; notFound: string[] } | null>(null)
  const ids = entryIdsOf(text)
  return (
    <section className="box operation" aria-label={t('adminAccess.operationsPage.erase')}>
      <h3 className="section-label">{t('adminAccess.operationsPage.erase')}</h3>
      <span className="muted small">{t('adminAccess.operationsPage.eraseHint')}</span>
      <label className="field">
        {t('adminAccess.operationsPage.entryIds')}
        <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <span className="muted small">{t('adminAccess.operationsPage.entryIdsHint')}</span>
      <div className="dialog-actions">
        <button
          type="button"
          className="btn danger"
          disabled={!ids.length}
          onClick={() => {
            setDone(null)
            setConfirming(ids)
          }}
        >
          {t('adminAccess.operationsPage.eraseButton')}
        </button>
      </div>
      {done ? (
        <Outcome
          lines={[
            ['adminAccess.operationsPage.erased', done.erased],
            ['adminAccess.operationsPage.held', done.held],
            ['adminAccess.operationsPage.notFound', done.notFound],
          ]}
        />
      ) : null}
      {confirming ? (
        <ConfirmAction
          title={t('adminAccess.operationsPage.erase')}
          target={t('adminAccess.operationsPage.onEntries', { ids: confirming.join(', ') })}
          action={t('adminAccess.operationsPage.eraseDo')}
          danger
          onCancel={() => setConfirming(null)}
          onConfirm={async (reason) => {
            const answer = await hub.adminCall(agent.did, (client, token) =>
              client.eraseEntries(token, reason, confirming)
            )
            setConfirming(null)
            setDone(answer)
            setText('')
          }}
        />
      ) : null}
    </section>
  )
}

/** Set or release a legal hold, on entries or on every entry of a conversation (PRIV-ERASE-004). */
function LegalHoldSection({ agent }: { agent: AgentRecord }) {
  const hub = useHub()
  const { t } = useTranslation()
  const [on, setOn] = useState<'entries' | 'conversation'>('entries')
  const [text, setText] = useState('')
  const [conversation, setConversation] = useState('')
  const [hold, setHold] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState<{ changed: string[]; skipped: string[] } | null>(null)
  const ids = entryIdsOf(text)
  const ready = on === 'entries' ? ids.length > 0 : !!conversation.trim()
  const target =
    on === 'entries'
      ? t('adminAccess.operationsPage.onEntries', { ids: ids.join(', ') })
      : t('adminAccess.operationsPage.onConversation', { id: conversation.trim() })
  const name = hold ? t('adminAccess.operationsPage.setHold') : t('adminAccess.operationsPage.releaseHold')
  return (
    <section className="box operation" aria-label={t('adminAccess.operationsPage.hold')}>
      <h3 className="section-label">{t('adminAccess.operationsPage.hold')}</h3>
      <div className="operation-choices" role="radiogroup" aria-label={t('adminAccess.operationsPage.holdOn')}>
        <label className="check">
          <input type="radio" name="hold-on" checked={on === 'entries'} onChange={() => setOn('entries')} />
          {t('adminAccess.operationsPage.entries')}
        </label>
        <label className="check">
          <input type="radio" name="hold-on" checked={on === 'conversation'} onChange={() => setOn('conversation')} />
          {t('adminAccess.operationsPage.aConversation')}
        </label>
      </div>
      {on === 'entries' ? (
        <label className="field">
          {t('adminAccess.operationsPage.entryIds')}
          <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      ) : (
        <label className="field">
          {t('adminAccess.operationsPage.conversationId')}
          <input className="input" value={conversation} onChange={(e) => setConversation(e.target.value)} />
        </label>
      )}
      <div className="operation-choices" role="radiogroup" aria-label={t('adminAccess.operationsPage.hold')}>
        <label className="check">
          <input type="radio" name="hold-kind" checked={hold} onChange={() => setHold(true)} />
          {t('adminAccess.operationsPage.setHold')}
        </label>
        <label className="check">
          <input type="radio" name="hold-kind" checked={!hold} onChange={() => setHold(false)} />
          {t('adminAccess.operationsPage.releaseHold')}
        </label>
      </div>
      <div className="dialog-actions">
        <button
          type="button"
          className="btn primary"
          disabled={!ready}
          onClick={() => {
            setDone(null)
            setConfirming(true)
          }}
        >
          {name}
        </button>
      </div>
      {done ? (
        <Outcome
          lines={[
            ['adminAccess.operationsPage.changed', done.changed],
            ['adminAccess.operationsPage.skipped', done.skipped],
          ]}
        />
      ) : null}
      {confirming ? (
        <ConfirmAction
          title={name}
          target={target}
          action={name}
          onCancel={() => setConfirming(false)}
          onConfirm={async (reason) => {
            const answer = await hub.adminCall(agent.did, (client, token) =>
              client.legalHold(
                token,
                reason,
                on === 'entries' ? { entryIds: ids } : { conversationId: conversation.trim() },
                hold
              )
            )
            setConfirming(false)
            setDone(answer)
          }}
        />
      ) : null}
    </section>
  )
}

/** The keys' versions and the progress of a rotation, a read with its reason; Rotate for each (PRIV-KEY-008). */
function KeysSection({ agent }: { agent: AgentRecord }) {
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [reason, setReason] = useState('')
  const [keys, setKeys] = useState<KeysResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rotating, setRotating] = useState<AdminKeyName | null>(null)
  const [notice, setNotice] = useState('')
  const read = async (why: string) => {
    setBusy(true)
    setError('')
    try {
      setKeys(await hub.adminCall(agent.did, (client, token) => client.adminKeys(token, why)))
    } catch (err) {
      setError(adminErrorWords(err, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="box operation" aria-label={t('adminAccess.operationsPage.keys')}>
      <h3 className="section-label">{t('adminAccess.operationsPage.keys')}</h3>
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (adminReasonFits(reason)) void read(reason.trim())
        }}
      >
        <ReasonField value={reason} onChange={setReason} />
        <div className="dialog-actions">
          <button type="submit" className="btn" disabled={busy || !adminReasonFits(reason)}>
            {t('adminAccess.operationsPage.showKeys')}
          </button>
        </div>
      </form>
      <AdminError text={error} />
      {notice ? (
        <div className="operation-outcome" role="status">
          {notice}
        </div>
      ) : null}
      {keys ? (
        <>
          <div className="table-wrap">
            <table className="members-table keys-table">
              <thead>
                <tr>
                  <th>{t('adminAccess.operationsPage.key')}</th>
                  <th>{t('adminAccess.operationsPage.versions')}</th>
                  <th>{t('adminAccess.operationsPage.rotation')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.keys.map((k) => (
                  <tr key={k.key}>
                    <td>
                      <b>{t(`adminAccess.operationsPage.keyName.${k.key}`)}</b>
                    </td>
                    <td>
                      {k.versions.map((v) => (
                        <div key={v.version}>
                          {t('adminAccess.operationsPage.version', { version: v.version })}
                          {v.current ? ` · ${t('adminAccess.operationsPage.current')}` : ''}
                          {v.wraps !== null ? ` · ${t('adminAccess.operationsPage.wraps', { n: v.wraps })}` : ''}
                        </div>
                      ))}
                    </td>
                    <td>
                      {k.rotation
                        ? t('adminAccess.operationsPage.rotationProgress', {
                            from: k.rotation.from,
                            to: k.rotation.to,
                            done: k.rotation.done,
                            total: k.rotation.total,
                          })
                        : t('adminAccess.operationsPage.noRotation')}
                    </td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="btn small"
                        disabled={!k.rotatable}
                        title={k.rotatable ? undefined : t('adminAccess.operationsPage.notRotatable')}
                        onClick={() => {
                          setNotice('')
                          setRotating(k.key)
                        }}
                      >
                        {t('adminAccess.operationsPage.rotate')}
                      </button>
                      {k.rotatable ? null : (
                        <div className="muted small">{t('adminAccess.operationsPage.notRotatable')}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="muted small">
            {keys.keyService
              ? t('adminAccess.operationsPage.keyService', {
                  time: formatTime(keys.keyService.lastAnsweredAt, i18n.language),
                })
              : t('adminAccess.operationsPage.noKeyService')}
          </span>
        </>
      ) : null}
      {rotating ? (
        <ConfirmAction
          title={t(`adminAccess.operationsPage.rotateKey.${rotating}`)}
          target={t('adminAccess.operationsPage.rotateTarget', {
            key: t(`adminAccess.operationsPage.keyName.${rotating}`),
          })}
          action={t('adminAccess.operationsPage.rotate')}
          onCancel={() => setRotating(null)}
          onConfirm={async (why) => {
            try {
              await hub.adminCall(agent.did, (client, token) => client.rotateKey(token, why, rotating))
            } catch (err) {
              // the reference agent cannot rotate while its key store is not built (PRIV-KEY-008)
              if (err instanceof ProfileError && err.status === 501)
                throw new Error(t('adminAccess.operationsPage.notRotatable'))
              throw err
            }
            setRotating(null)
            setNotice(t('adminAccess.operationsPage.rotationStarted'))
            // its progress, read with the rotation's reason
            await read(why)
          }}
        />
      ) : null}
    </section>
  )
}
