/**
 * The browser's stylesheet against the shared design of a conversation (`CONVERSATION_DESIGN` in the core): the
 * Ayni app builds its styles from those values, so a change made on one side only fails here.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONVERSATION_COLORS, CONVERSATION_COPY, CONVERSATION_DESIGN as D } from '@ayni.org/ayni-ui-core'
import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'

// the tests run from the repository root (the test environment gives no file URL for this module)
const css = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8')

/** The declarations of the rule with exactly this selector. */
function rule(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css)
  if (!match) throw new Error(`no rule for ${selector}`)
  return Object.fromEntries(
    (match[1] as string)
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(':')
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
      })
  )
}
const px = (n: number) => `${n}px`
const pct = (share: number) => `${Math.round(share * 100)}%`
const role = (name: string) => `var(--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})`

/** The relative luminance of a hex or rgb() colour (WCAG). */
function luminance(colour: string): number {
  const channels = colour.startsWith('#')
    ? [1, 3, 5].map((i) => Number.parseInt(colour.slice(i, i + 2), 16))
    : (colour.match(/\d+/g) ?? []).map(Number)
  const [r, g, b] = channels.map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** The contrast ratio of two colours (WCAG). */
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
/** `color-mix(in srgb, a share, b)`, as the browser computes it. */
function mix(a: string, share: number, b: string): string {
  const of = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
  const [x, y] = [of(a), of(b)]
  return `rgb(${x.map((c, i) => Math.round(c * share + (y[i] as number) * (1 - share))).join(', ')})`
}

describe('the stylesheet follows the shared conversation design', () => {
  it('the transcript', () => {
    const t = D.transcript
    expect(rule('.transcript').padding).toBe(`${px(t.paddingTop)} ${px(t.paddingX)} ${px(t.paddingBottom)}`)
    expect(rule('.transcript').gap).toBe(px(t.gap))
  })

  it('the bubble, on each side', () => {
    const b = D.bubble
    const msg = rule('.msg')
    expect(msg['max-width']).toBe(`min(${px(b.maxWidth)}, 100%)`)
    expect(msg.padding).toBe(`${px(b.paddingTop)} ${px(b.paddingX)} ${px(b.paddingBottom)}`)
    expect(msg['border-radius']).toBe(px(b.radius))
    expect(msg.gap).toBe(px(b.gap))
    const user = rule('.msg.user')
    expect(user['border-bottom-right-radius']).toBe(px(b.tailRadius))
    expect(user.background).toBe(role(CONVERSATION_COLORS.userBubble.background))
    expect(user.color).toBe(role(CONVERSATION_COLORS.userBubble.text))
    const assistant = rule('.msg.assistant')
    expect(assistant['border-top-left-radius']).toBe(px(b.tailRadius))
    expect(assistant.background).toBe(role(CONVERSATION_COLORS.assistantBubble.background))
    expect(rule('.bubble-wrap.reacted')['margin-bottom']).toBe(px(b.reactedMarginBottom))
    expect(rule('.bubble-wrap.reacted .msg')['padding-bottom']).toBe(px(b.reactedPaddingBottom))
  })

  it('the system line and the meta line', () => {
    expect(rule('.msg.system')['font-size']).toBe(px(D.system.fontSize))
    expect(rule('.msg.system').color).toBe(role(CONVERSATION_COLORS.system.text))
    const meta = rule('.msg .meta')
    expect(meta['font-size']).toBe(px(D.meta.fontSize))
    expect(meta.gap).toBe(px(D.meta.gap))
    expect(meta.color).toBe(role(CONVERSATION_COLORS.meta.text))
    expect(rule('.msg.user .meta').color).toBe(
      `color-mix(in srgb, var(--accent-contrast) ${pct(D.meta.userTextOpacity)}, transparent)`
    )
    expect(rule('.interrupted').color).toBe(role(CONVERSATION_COLORS.interrupted.text))
  })

  it('the quote of a reply', () => {
    const q = D.quote
    const quote = rule('.quote')
    expect(quote.padding).toBe(`${px(q.paddingY)} ${px(q.paddingX)}`)
    expect(quote['border-left']).toBe(`${px(q.borderWidth)} solid ${role(CONVERSATION_COLORS.quote.border)}`)
    expect(quote['border-radius']).toBe(px(q.radius))
    expect(quote['font-size']).toBe(px(q.fontSize))
    expect(quote.gap).toBe(px(q.gap))
    expect(quote['margin-bottom']).toBe(px(q.marginBottom))
    expect(quote.background).toBe(`color-mix(in srgb, var(--text) ${pct(q.tint)}, transparent)`)
    const mine = rule('.msg.user .quote')
    expect(mine['border-left-color']).toBe(
      `color-mix(in srgb, var(--accent-contrast) ${pct(q.userBorderOpacity)}, transparent)`
    )
    expect(mine.background).toBe(`color-mix(in srgb, var(--accent-contrast) ${pct(q.userTint)}, transparent)`)
    expect(rule('.quote-who')['font-weight']).toBe(String(q.whoWeight))
    expect(rule('.quote-who').color).toBe(role(CONVERSATION_COLORS.quote.who))
    expect(rule('.quote-text').opacity).toBe(String(q.textOpacity))
  })

  it('the reaction pill', () => {
    const p = D.reactionPill
    const pill = rule('.pill')
    expect(pill.height).toBe(px(p.height))
    expect(pill.padding).toBe(`0 ${px(p.paddingX)}`)
    expect(pill['border-radius']).toBe(px(p.radius))
    expect(pill.border).toBe(`${px(p.borderWidth)} solid ${role(CONVERSATION_COLORS.reactionPill.border)}`)
    expect(pill['font-size']).toBe(px(p.fontSize))
    expect(pill.gap).toBe(px(p.gap))
    expect(pill.bottom).toBe(px(-p.overlap))
    expect(pill.background).toBe(role(CONVERSATION_COLORS.reactionPill.background))
    expect(rule('.row.theirs .pill').right).toBe(px(-p.outset))
    expect(rule('.row.mine .pill').left).toBe(px(-p.outset))
    const mine = rule('.pill.mine')
    expect(mine['border-color']).toBe(role(CONVERSATION_COLORS.reactionPill.mineBorder))
    expect(mine.background).toBe(`color-mix(in srgb, var(--accent) ${pct(p.mineTint)}, var(--bg))`)
  })

  it('the agent is working: the bubble, the three dots and their bounce', () => {
    const p = D.progress
    const progress = rule('.progress')
    expect(progress['font-size']).toBe(px(p.fontSize))
    expect(progress.gap).toBe(px(p.gap))
    expect(progress.padding).toBe(`${px(p.paddingY)} ${px(p.paddingX)}`)
    expect(progress['border-radius']).toBe(px(p.radius))
    expect(progress['border-top-left-radius']).toBe(px(p.tailRadius))
    expect(progress.background).toBe(role(CONVERSATION_COLORS.progress.background))
    expect(progress.color).toBe(role(CONVERSATION_COLORS.progress.text))
    const d = D.dots
    expect(rule('.dots').gap).toBe(px(d.gap))
    const dot = rule('.dots span')
    expect(dot.width).toBe(px(d.size))
    expect(dot.height).toBe(px(d.size))
    expect(dot.background).toBe(role(CONVERSATION_COLORS.dots.color))
    expect(dot.animation).toBe(`bounce ${d.periodMs / 1000}s infinite ease-in-out`)
    expect(rule('.dots span:nth-child(2)')['animation-delay']).toBe(`${d.delayMs / 1000}s`)
    expect(rule('.dots span:nth-child(3)')['animation-delay']).toBe(`${(2 * d.delayMs) / 1000}s`)
    // the keyframes: at rest at the start, from `restFrom` and at the end; at the peak at `peakAt`
    const frames = /@keyframes bounce \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
    const squeezed = frames.replace(/\s+/g, ' ')
    expect(squeezed).toContain(`0%, ${pct(d.restFrom)}, 100% { transform: translateY(0); opacity: ${d.restOpacity}; }`)
    expect(squeezed).toContain(`${pct(d.peakAt)} { transform: translateY(${px(-d.lift)}); opacity: 1; }`)
  })

  it('the button back to the latest message', () => {
    const l = D.latestButton
    const latest = rule('.latest')
    expect(latest.width).toBe(px(l.size))
    expect(latest.height).toBe(px(l.size))
    expect(latest.right).toBe(px(l.right))
    expect(latest.bottom).toBe(px(l.bottom))
    expect(latest.background).toBe(role(CONVERSATION_COLORS.latestButton.background))
    expect(latest.border).toBe(`1px solid ${role(CONVERSATION_COLORS.latestButton.border)}`)
    expect(latest.color).toBe(role(CONVERSATION_COLORS.latestButton.icon))
  })

  it('a message of the person the AI never received: no fill, an edge, the meta line in the accent (UI-CONV-044)', () => {
    const w = rule('.msg.user.withheld')
    expect(w.background).toBe('transparent')
    expect(w.color).toBe(role(CONVERSATION_COLORS.withheldBubble.text))
    expect(w.border).toBe(`${px(D.withheld.borderWidth)} solid ${role(CONVERSATION_COLORS.withheldBubble.border)}`)
    // the shape is the person's bubble's: its radius and its tighter corner come from .msg and .msg.user
    expect(w['border-radius']).toBeUndefined()
    expect(w['border-bottom-right-radius']).toBeUndefined()
    expect(rule('.msg.withheld .meta').color).toBe(role(CONVERSATION_COLORS.withheldBubble.meta))
    expect(rule('.withheld-label').gap).toBe(px(D.withheld.iconGap))
  })

  it('the memory line is a centred chip with an edge that reads (UI-CONV-035)', () => {
    const c = D.memoryChip
    expect(rule('.memory-line')['align-self']).toBe('center')
    const chip = rule('.memory-chip')
    expect(chip.padding).toBe(`${px(c.paddingY)} ${px(c.paddingX)}`)
    expect(chip['border-radius']).toBe(px(c.radius))
    expect(chip.border).toBe(
      `${px(c.borderWidth)} solid color-mix(in srgb, ${role(CONVERSATION_COLORS.memoryChip.border)} ${pct(c.borderShare)}, transparent)`
    )
    expect(chip.background).toBe('transparent')
    expect(chip.color).toBe(role(CONVERSATION_COLORS.memoryChip.text))
    expect(chip['font-size']).toBe(px(c.fontSize))
    expect(chip.gap).toBe(px(c.gap))
  })

  it('the new colours read on both palettes, chosen or by the system (UI-CONV-035, UI-CONV-044)', () => {
    // the palettes as the stylesheet defines them, and the roles each theme takes from them
    const token = (name: string) => {
      const value = new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(css)?.[1]
      if (!value) throw new Error(`no --${name}`)
      return value
    }
    const block = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`${escaped} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''
    }
    const roles = ['bg', 'text', 'muted', 'accent'] as const
    const system = block('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"])')
    const chosen = block(':root[data-theme="dark"]')
    for (const dark of [system, chosen])
      for (const r of roles) expect(dark, `--${r} in a dark block`).toContain(`--${r}: var(--dark-${r});`)
    for (const r of roles) expect(rule(':root')[`--${r}`]).toBe(`var(--light-${r})`)
    for (const scheme of ['light', 'dark']) {
      const of = (r: string) => token(`${scheme}-${r}`)
      const ground = of('bg')
      // the chip's edge, the muted colour at its share over the transcript's ground
      const edge = mix(of(CONVERSATION_COLORS.memoryChip.border), D.memoryChip.borderShare, ground)
      expect(contrast(edge, ground), `${scheme}: chip edge`).toBeGreaterThan(contrast(of('border'), ground) + 0.5)
      expect(contrast(edge, ground), `${scheme}: chip edge`).toBeGreaterThanOrEqual(1.8)
      expect(contrast(of(CONVERSATION_COLORS.memoryChip.text), ground), `${scheme}: chip words`).toBeGreaterThan(4.5)
      // the withheld bubble has no fill: its text, its meta line and its edge stand on the ground
      const w = CONVERSATION_COLORS.withheldBubble
      expect(contrast(of(w.text), ground), `${scheme}: withheld text`).toBeGreaterThan(4.5)
      expect(contrast(of(w.meta), ground), `${scheme}: withheld meta`).toBeGreaterThan(4.5)
      expect(contrast(of(w.border), ground), `${scheme}: withheld edge`).toBeGreaterThan(3)
    }
  })

  it('the English wording is the shared one', () => {
    for (const [key, text] of Object.entries(CONVERSATION_COPY))
      expect((en.conversation as Record<string, unknown>)[key], key).toBe(text)
  })
})
