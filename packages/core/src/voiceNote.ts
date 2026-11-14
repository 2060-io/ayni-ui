/**
 * The length and the waveform of a voice note (PROF-HIST-009, UI-MEDIA-008, APP-MEDIA-010). The device that
 * records a note measures both as it goes, and sends them with the upload; every device then shows the note the
 * same way: its duration before it is played, and the shape of its sound as bars, the played part marked. These
 * are the rules the browser and the app share: what is sent, what is read back, and what is drawn.
 */

/** How many levels a recorded note is sent with; an agent takes 64 at most. */
export const WAVEFORM_LEVELS = 48

/** The measures of a recorded note, as its recorder has them. */
export interface VoiceMeasures {
  durationMs?: number
  /** whole numbers from 0 to 100, start to end */
  waveform?: readonly number[]
}

/** The level of each of `count` equal parts of `levels`: the loudest moment of the part. */
function parts(levels: readonly number[], count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * levels.length) / count)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / count))
    let peak = 0
    for (let j = from; j < to && j < levels.length; j++) peak = Math.max(peak, levels[j] ?? 0)
    out.push(peak)
  }
  return out
}

/**
 * The waveform a recorder sends: the levels it sampled while recording (each from 0 to 1, at a steady pace), as
 * `count` whole numbers from 0 to 100, the loudest moment of the note at 100. A note of pure silence is flat at
 * 0; a recorder that sampled nothing has no waveform.
 */
export function waveformFrom(levels: readonly number[], count = WAVEFORM_LEVELS): number[] | undefined {
  const sampled = levels.filter((level) => Number.isFinite(level)).map((level) => Math.min(1, Math.max(0, level)))
  if (!sampled.length) return undefined
  // a note shorter than the bars it could fill has as many as it has samples
  const shaped = parts(sampled, Math.min(count, sampled.length))
  const peak = Math.max(...shaped)
  return shaped.map((level) => (peak > 0 ? Math.round((level / peak) * 100) : 0))
}

/** The fields of an upload that carry a note's measures (PROF-HIST-009); none for what was not measured. */
export function voiceMeasureFields(measures: VoiceMeasures | undefined): Record<string, string> {
  const fields: Record<string, string> = {}
  if (measures?.durationMs && measures.durationMs > 0)
    fields.duration = String(Math.max(0.1, Math.round(measures.durationMs / 100) / 10))
  if (measures?.waveform?.length) fields.waveform = JSON.stringify(measures.waveform)
  return fields
}

/** The waveform an attachment carries, when it reads as one. */
export function waveformOf(attachment: unknown): number[] | undefined {
  const waveform = (attachment as { waveform?: unknown } | null | undefined)?.waveform
  if (!Array.isArray(waveform) || !waveform.length) return undefined
  if (!waveform.every((level) => typeof level === 'number' && Number.isFinite(level))) return undefined
  return waveform.map((level) => Math.min(100, Math.max(0, Math.round(level))))
}

/** A waveform over the number of bars there is room for: fewer bars take the loudest of what they cover. */
export function waveformBars(waveform: readonly number[], bars: number): number[] {
  if (bars <= 0 || !waveform.length) return []
  if (bars >= waveform.length) {
    // more room than levels: each level is drawn over the bars it covers
    return Array.from({ length: bars }, (_, i) => waveform[Math.floor((i * waveform.length) / bars)] ?? 0)
  }
  return parts(waveform, bars)
}

/** How many of `bars` bars are played at this share of the note (0 to 1). */
export function playedBars(bars: number, fraction: number): number {
  if (!(fraction > 0)) return 0
  return Math.min(bars, Math.max(0, Math.round(bars * fraction)))
}

/** The length of a note as it is written: "0:07", "1:05", "12:30". */
export function noteLength(ms: number | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000))
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}
