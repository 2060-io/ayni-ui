/**
 * A team space's managed folder (UI-CONV-069 to 071, UI-CONV-052; profile package 3.5.9, PROF-TOOL-040 to 043; agent
 * D145 to D150). In a team space Files has two modes: the folder the agent makes at the provider when the owner adds
 * Files, owned by the organization, whose members it keeps in step with the space's people; or a folder that already
 * exists. Add shows the two modes where the provider has both, the managed one first and selected. In the managed mode
 * the row of Files, its panel and About show the folder's line ("Folder: <folder> · Managed by <agent>", with "Open in
 * <provider>"), its state in words and, to the owner, how many members have no access yet; the owner's panel renames
 * the folder at once and checks it again; a member whose access is not in place reads so in About.
 */
import {
  type AgentRecord,
  accountSourceOf,
  FOLDER_CHECK,
  FOLDER_TITLE_MAX,
  type FolderLine,
  folderCheckOf,
  folderLineOf,
  folderRenameOf,
  folderStatusOf,
  folderTitleOf,
  membersWithoutAccessOf,
  myAccessWaits,
  type OwnerFolder,
  ownerFolderOf,
  ProfileError,
  type SpaceFeature,
  type SpaceInfo,
  type SpaceTool,
  type SpaceToolLocation,
  toolRefusalOf,
} from '@ayni.org/ayni-ui-core'
import { CircleAlert, ExternalLink, TriangleAlert } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub } from '../state/useHub.js'
import { AccountNoticeLine, SignInWaiting, useSignIn } from './Accounts.js'

type T = (key: string, options?: Record<string, unknown>) => string

/** A refusal said at the field it names (UI-CONV-052). */
export function FieldError({ text }: { text: string | undefined | null }): ReactNode {
  if (!text) return null
  return (
    <span className="field-error" role="alert">
      <CircleAlert size={13} aria-hidden="true" className="field-error-icon" /> {text}
    </span>
  )
}

/**
 * The two modes of Files, when the owner adds it or changes its provider (UI-CONV-069, UI-CONV-052): "A new folder for
 * this space", with the line "<agent> makes it at <provider>, owned by your organization, and gives the space's members
 * access to it.", then "A folder that already exists", with "You choose it; <agent> changes nobody's access to it.";
 * the managed one first. The choice is named for a screen reader by the feature's folder; a refusal of the mode
 * (`location`) is said under it.
 */
export function LocationChoice({
  agentName,
  feature,
  source,
  provider,
  locations,
  value,
  disabled,
  error,
  onChoose,
}: {
  agentName: string
  feature: SpaceFeature
  /** the provider the modes are of, which names the group of its choices */
  source: string
  /** the provider's title, as the managed mode's line names it */
  provider: string
  locations: readonly SpaceToolLocation[]
  value: SpaceToolLocation | null
  disabled: boolean
  error?: string | null
  onChoose: (location: SpaceToolLocation) => void
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="field tool-providers tool-locations">
      <legend className="sr-only">{t('tools.folder.choice', { feature: feature.title })}</legend>
      {locations.map((mode) => (
        <label key={mode} className="tool-provider-option tool-location-option">
          <input
            type="radio"
            name={`location-${feature.id}-${source}`}
            value={mode}
            checked={value === mode}
            disabled={disabled}
            onChange={() => onChoose(mode)}
          />
          <span className="tool-provider-text">
            <span className="tool-provider-title">{t(`tools.folder.${mode}`)}</span>
            <span className="muted small">{t(`tools.folder.${mode}Line`, { agent: agentName, provider })}</span>
          </span>
        </label>
      ))}
      <FieldError text={error} />
    </fieldset>
  )
}

/** The line of a managed folder (UI-CONV-052): "Folder: <folder> · Managed by <agent>". */
export function folderLineWords(line: FolderLine, agentName: string, t: T): string {
  return t('tools.folder.line', { folder: line.folder, agent: agentName })
}

/** "Open in <provider>" (UI-CONV-070): the folder's `webUrl`, in a new tab; none for a folder the store gives no link of. */
export function FolderOpen({ line, className = '' }: { line: FolderLine; className?: string }) {
  const { t } = useTranslation()
  if (!line.webUrl) return null
  return (
    <a
      className={['link', 'folder-open', className].filter(Boolean).join(' ')}
      href={line.webUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t('tools.folder.open', { provider: line.provider })}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  )
}

/**
 * The state of the folder in words, to the owner (UI-CONV-052): the account to allow, a folder that needs a manager, a
 * folder the store did not let the agent make; nothing once it is ready. While it is made, "Making the folder at
 * <provider>…" stands in place of the state of the row (`makingFolder`).
 */
export function folderStatusWords(folder: OwnerFolder, provider: string, agentName: string, t: T): string | null {
  switch (folderStatusOf(folder)) {
    case 'allow':
      return t('tools.folder.allow', { provider })
    case 'creating':
      return t('tools.folder.creating', { provider })
    case 'needsManager':
      return t('tools.folder.needsManager', { agent: agentName, folder: folder.title })
    case 'failed':
      return t('tools.folder.failed', { provider, agent: agentName })
    default:
      return null
  }
}

/** How many members have no access yet, to the owner (UI-CONV-052): "1 member has no access yet"; none when all have. */
export function withoutAccessWords(folder: OwnerFolder, t: T): string | null {
  const count = membersWithoutAccessOf(folder)
  return count ? t('tools.folder.withoutAccess', { count }) : null
}

/**
 * The lines of a managed folder under its feature's provider (UI-CONV-070), on the row of Files and in About: the
 * folder's line; to the owner its state (but while it is made, which the row's state says) and the members without
 * access; to a member whose access is not in place, "No access yet. <agent> is giving you access to this space's
 * folder." "Open in <provider>" is the caller's, beside them.
 */
export function FolderLines({
  agentName,
  tool,
  lineClass,
  creating = true,
}: {
  agentName: string
  tool: SpaceTool
  /** the class of each line, the row's or About's */
  lineClass: string
  /** whether "Making the folder at <provider>…" is one of the lines (About), or the row's state says it */
  creating?: boolean
}) {
  const { t } = useTranslation()
  const line = folderLineOf(tool)
  if (!line) return null
  const owner = ownerFolderOf(tool)
  const status =
    owner && (creating || folderStatusOf(owner) !== 'creating')
      ? folderStatusWords(owner, line.provider, agentName, t)
      : null
  const without = owner ? withoutAccessWords(owner, t) : null
  return (
    <>
      <span className={`${lineClass} tool-folder-line`}>{folderLineWords(line, agentName, t)}</span>
      {status ? (
        <span className={`${lineClass} tool-folder-status`} role="note">
          <TriangleAlert size={13} aria-hidden="true" className="tool-not-conformant-icon" /> {status}
        </span>
      ) : null}
      {without ? <span className={`${lineClass} tool-folder-without`}>{without}</span> : null}
      {myAccessWaits(tool) ? (
        <span className={`${lineClass} tool-folder-my-access`}>{t('tools.folder.myAccess', { agent: agentName })}</span>
      ) : null}
    </>
  )
}

/**
 * The managed folder in the owner's panel of Files (UI-CONV-070, UI-CONV-052, PROF-TOOL-043), in Settings of the tool,
 * where the panel of a folder that exists has its list: no choice of folder, but its line and "Open in <provider>", its
 * state with its control, the members without access, and Rename folder. Allow starts the sign-in of the owner's
 * account of the provider for the space (UI-CONV-061, UI-CONV-054); Check again and Try again check the folder again
 * (`folder.check`, answered `202` with the item); Rename folder opens "Name of the folder" with Save and Cancel, which
 * renames it at once (`200`, "Saved"). Rename is offered once the folder is made (ready, or without a manager): before,
 * the agent has none to rename. A refusal of the name is said at its field, any other under the section.
 */
export function FolderSection({
  agent,
  space,
  tool,
  onTool,
  onReload,
}: {
  agent: AgentRecord
  space: SpaceInfo
  tool: SpaceTool
  onTool: (tool: SpaceTool) => void
  onReload: () => void
}) {
  const hub = useHub()
  const { t } = useTranslation()
  const folder = ownerFolderOf(tool)
  const line = folderLineOf(tool)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const signIn = useSignIn(agent, { source: accountSourceOf(tool), title: tool.title ?? '', spaceId: space.id })
  if (!folder || !line || !tool.source) return null
  const source = tool.source
  const status = folderStatusOf(folder)
  const check = folderCheckOf(status)
  const words = folderStatusWords(folder, line.provider, agent.name, t)
  const without = withoutAccessWords(folder, t)
  const made = folder.state === 'ready' || folder.state === 'needs-manager'
  const title = folderTitleOf(name)

  const refused = (e: unknown) => {
    const r = toolRefusalOf(e instanceof ProfileError ? e : undefined)
    if (r.at === 'folderTitle') {
      // the name the profile does not take (`422 bad-name`), at its field (UI-CONV-052's words of a value refused)
      setNameError(t('tools.badValue', { agent: agent.name }))
      return
    }
    setError(r.at === 'panel' && r.reason === 'notOwner' ? t('tools.notOwner') : String((e as Error).message))
    // the folder is not what this panel read (`409 not-managed`): it is read again
    if (e instanceof ProfileError && e.status === 409) onReload()
  }
  const run = async (request: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setNameError('')
    setSaved(false)
    try {
      await request()
    } catch (e) {
      refused(e)
    } finally {
      setBusy(false)
    }
  }
  const rename = () =>
    title
      ? run(async () => {
          const answer = await hub.patchSpaceTool(agent.did, space.id, source, folderRenameOf(title))
          setRenaming(false)
          setSaved(true)
          onTool(answer.tool)
        })
      : undefined
  const checkAgain = () =>
    run(async () => {
      const answer = await hub.patchSpaceTool(agent.did, space.id, source, FOLDER_CHECK)
      onTool(answer.tool)
    })

  return (
    <div className="tool-folder">
      <div className="tool-folder-head">
        <span className="tool-folder-line">{folderLineWords(line, agent.name, t)}</span>
        <FolderOpen line={line} />
      </div>
      {words ? (
        <div className="tool-folder-status" role="note">
          {status === 'creating' ? null : (
            <TriangleAlert size={14} aria-hidden="true" className="tool-not-conformant-icon" />
          )}{' '}
          <span>{words}</span>
        </div>
      ) : null}
      {status === 'allow' && !signIn.attempt ? (
        <div className="tool-actions">
          <button type="button" className="btn" disabled={busy || signIn.busy} onClick={signIn.start}>
            {t('tools.folder.allowButton')}
          </button>
        </div>
      ) : null}
      {status === 'allow' ? (
        <>
          <SignInWaiting signIn={signIn} />
          <AccountNoticeLine notice={signIn.notice} />
        </>
      ) : null}
      {check ? (
        <div className="tool-actions">
          <button type="button" className="btn folder-check" disabled={busy} onClick={() => void checkAgain()}>
            {t(`tools.folder.${check}`)}
          </button>
        </div>
      ) : null}
      {without ? <p className="tool-folder-without">{without}</p> : null}
      {renaming ? (
        <div className="tool-folder-rename">
          <label className="field">
            {t('tools.folder.name')}
            <input
              className="input"
              value={name}
              maxLength={FOLDER_TITLE_MAX}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              aria-invalid={nameError ? true : undefined}
              onChange={(e) => {
                setName(e.target.value)
                setNameError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void rename()
                }
              }}
            />
            <FieldError text={nameError} />
          </label>
          <div className="tool-actions">
            <button
              type="button"
              className="btn primary folder-rename-save"
              disabled={busy || !title || title === folder.title}
              onClick={() => void rename()}
            >
              {t('tools.save')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setRenaming(false)
                setNameError('')
              }}
            >
              {t('app.cancel')}
            </button>
          </div>
        </div>
      ) : made ? (
        <div className="tool-actions">
          <button
            type="button"
            className="btn folder-rename"
            disabled={busy}
            onClick={() => {
              setName(folder.title)
              setSaved(false)
              setRenaming(true)
            }}
          >
            {t('tools.folder.rename')}
          </button>
        </div>
      ) : null}
      {saved ? (
        <div className="tool-change-outcome" role="status">
          {t('tools.saved')}
        </div>
      ) : null}
      {error ? (
        <div className="tool-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}
