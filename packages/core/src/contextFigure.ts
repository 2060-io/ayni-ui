/**
 * The context of a conversation (UI-CONV-026, APP-CONV-028, PROF-STREAM-007): after each turn, the agent publishes in
 * its state how much of the model's context window the conversation takes, and the browser and the app show it under
 * the message form. Their wording is the client's (`conversation.context`, `conversation.contextCached`); the figure
 * and its numbers are read here, the same for both.
 */

/** `state.ayni.context`: the input of the turn's last model call, the part of it served from the provider's cache, the window's budget. */
export interface ContextFigure {
  used: number
  cached: number
  max: number
  /** when the turn ended */
  at: string
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * The context figure in the agent's state, or null: before the agent's first figure, from an agent that publishes
 * none, or when one of its numbers is not a finite number. Read whatever the agent declares in its features.
 */
export function contextFigureOf(ayni: unknown): ContextFigure | null {
  const context = (ayni as { context?: unknown } | null | undefined)?.context
  if (typeof context !== 'object' || context === null) return null
  const { used, cached, max, at } = context as Record<string, unknown>
  if (!isNumber(used) || !isNumber(cached) || !isNumber(max)) return null
  return { used, cached, max, at: typeof at === 'string' ? at : '' }
}

/**
 * A number of tokens as the context line writes it: as it is below a thousand; in thousands with at most one
 * decimal from a thousand (`6.2k`, `100k`); in millions from a million (`1.2M`). The decimal is a `.` in every
 * language: the figure is technical.
 */
export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  const oneDecimal = (x: number) => x.toFixed(1).replace(/\.0$/, '')
  const k = Math.round(n / 100) / 10
  if (k >= 1000) return `${oneDecimal(Math.round(n / 100_000) / 10)}M`
  return `${oneDecimal(k)}k`
}

/**
 * The numbers of the context line: `Context <used> / <max>`, followed by ` · <cached> cached` only when part of the
 * context was served from the provider's cache (`cached` is then given).
 */
export function contextLineOf(figure: ContextFigure): { used: string; max: string; cached?: string } {
  const numbers = { used: formatTokens(figure.used), max: formatTokens(figure.max) }
  return figure.cached > 0 ? { ...numbers, cached: formatTokens(figure.cached) } : numbers
}
