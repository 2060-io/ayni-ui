/**
 * The browser's stylesheet as the design tests read it: the declarations of a rule by its exact selector. The
 * shared designs of the core (`HOME_DESIGN`, `PROOF_OF_TRUST_DESIGN`) are compared with it, so a change made on
 * one side only fails a test.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// the tests run from the repository root (the test environment gives no file URL for this module)
export const css = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8')

/** The declarations of the rules with exactly this selector, a later rule overriding an earlier one. */
export function rule(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...css.matchAll(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`, 'g'))]
  if (!matches.length) throw new Error(`no rule for ${selector}`)
  return Object.fromEntries(
    matches.flatMap((match) =>
      (match[1] as string)
        .replace(/\/\*[^*]*\*\//g, '')
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const i = d.indexOf(':')
          return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
        })
    )
  )
}

export const px = (n: number) => `${n}px`
export const pct = (share: number) => `${Math.round(share * 100)}%`
export const em = (n: number) => `${n}em`
/** A colour role as the stylesheet names it: `accentContrast` is `var(--accent-contrast)`. */
export const role = (name: string) => `var(--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})`
/** A share of a colour over the background, as the stylesheet mixes it. */
export const tint = (name: string, share: number) => `color-mix(in srgb, ${role(name)} ${pct(share)}, var(--bg))`
