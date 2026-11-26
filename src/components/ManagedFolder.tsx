/**
 * A team space's managed folder (UI-CONV-069 to 071, UI-CONV-052; profile package 3.5.9, PROF-TOOL-040 to 043; agent
 * D145 to D150). In a team space Files has two modes: the folder the agent makes at the provider when the owner adds
 * Files, owned by the organization, whose members it keeps in step with the space's people; or a folder that already
 * exists. Add shows the two modes where the provider has both, the managed one first and selected.
 */
import type { SpaceFeature, SpaceToolLocation } from '@ayni.org/ayni-ui-core'
import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

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
