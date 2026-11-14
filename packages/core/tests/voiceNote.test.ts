/** The length and the waveform of a voice note (PROF-HIST-009, UI-MEDIA-008): what is sent, read back and drawn. */
import { describe, expect, it } from 'vitest'
import {
  noteLength,
  playedBars,
  voiceMeasureFields,
  WAVEFORM_LEVELS,
  waveformBars,
  waveformFrom,
  waveformOf,
} from '../src/voiceNote.js'

describe('the waveform a recorder sends', () => {
  it('is the loudest of each part of the note, the loudest of all at 100', () => {
    // ten seconds at ten samples a second: quiet, loud in the middle, quiet
    const levels = [...Array(40).fill(0.1), ...Array(20).fill(0.5), ...Array(40).fill(0.1)]
    const waveform = waveformFrom(levels) as number[]
    expect(waveform).toHaveLength(WAVEFORM_LEVELS)
    expect(Math.max(...waveform)).toBe(100)
    expect(waveform[0]).toBe(20)
    expect(waveform[24]).toBe(100)
    expect(waveform.every((level) => Number.isInteger(level) && level >= 0 && level <= 100)).toBe(true)
  })

  it('keeps a short peak: a part is as loud as its loudest moment', () => {
    const levels = Array(480).fill(0.05)
    levels[250] = 1
    const waveform = waveformFrom(levels) as number[]
    expect(waveform[25]).toBe(100)
    expect(waveform[10]).toBe(5)
  })

  it('has as many levels as samples for a note shorter than its bars', () => {
    expect(waveformFrom([0.2, 0.4, 0.1])).toEqual([50, 100, 25])
  })

  it('is flat for silence, and none when nothing was sampled', () => {
    expect(waveformFrom([0, 0, 0])).toEqual([0, 0, 0])
    expect(waveformFrom([])).toBeUndefined()
    expect(waveformFrom([Number.NaN])).toBeUndefined()
    // out of range is brought back in
    expect(waveformFrom([-1, 2])).toEqual([0, 100])
  })
})

describe('the fields of an upload', () => {
  it('give the length in seconds to the tenth and the waveform as JSON', () => {
    expect(voiceMeasureFields({ durationMs: 3240, waveform: [0, 50, 100] })).toEqual({
      duration: '3.2',
      waveform: '[0,50,100]',
    })
    expect(voiceMeasureFields({ durationMs: 40 })).toEqual({ duration: '0.1' })
  })

  it('give nothing of what was not measured', () => {
    expect(voiceMeasureFields(undefined)).toEqual({})
    expect(voiceMeasureFields({ durationMs: 0, waveform: [] })).toEqual({})
  })
})

describe('the waveform of an attachment', () => {
  it('is read when it is one', () => {
    expect(waveformOf({ waveform: [0, 40, 100] })).toEqual([0, 40, 100])
    expect(waveformOf({ waveform: [-5, 40.4, 300] })).toEqual([0, 40, 100])
  })

  it('is none otherwise: the note keeps its plain line', () => {
    for (const attachment of [undefined, null, {}, { waveform: [] }, { waveform: 'x' }, { waveform: [1, 'a'] }])
      expect(waveformOf(attachment)).toBeUndefined()
  })
})

describe('the bars drawn', () => {
  it('fit the room there is: fewer bars take the loudest of what they cover, more repeat the levels', () => {
    expect(waveformBars([10, 20, 30, 100, 5, 0], 3)).toEqual([20, 100, 5])
    expect(waveformBars([10, 100], 4)).toEqual([10, 10, 100, 100])
    expect(waveformBars([10, 20], 2)).toEqual([10, 20])
    expect(waveformBars([], 4)).toEqual([])
    expect(waveformBars([1], 0)).toEqual([])
  })

  it('mark the part played', () => {
    expect(playedBars(40, 0)).toBe(0)
    expect(playedBars(40, 0.5)).toBe(20)
    expect(playedBars(40, 1)).toBe(40)
    expect(playedBars(40, 1.4)).toBe(40)
    expect(playedBars(40, Number.NaN)).toBe(0)
  })

  it('write the length of a note', () => {
    expect(noteLength(undefined)).toBe('0:00')
    expect(noteLength(7400)).toBe('0:07')
    expect(noteLength(65_000)).toBe('1:05')
  })
})
