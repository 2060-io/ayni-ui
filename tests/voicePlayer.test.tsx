/**
 * The player of a voice note (UI-MEDIA-007/008): its length before it is played, the shape of its sound as bars
 * with the played part marked, and the plain line for a note that carries no waveform.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AttachmentView } from '../src/components/AttachmentView.js'
import { initI18n } from '../src/i18n/index.js'
import { Hub } from '../src/state/hub.js'
import { HubContext } from '../src/state/useHub.js'

const config = {
  publicUrl: 'http://ui.test',
  singleAgent: false,
  trustPolicy: 'refuse' as const,
  trustRecheckIntervalSeconds: 600,
  veranaIndexerUrl: 'http://indexer.test',
  veranaGraphUrl: 'http://graph.test',
  allowedAgentOrigins: [],
  locales: ['en'],
  soundsEnabled: false,
  installPromptEnabled: false,
}

let root: Root | undefined
let host: HTMLDivElement | undefined

beforeAll(async () => {
  await initI18n(['en'])
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  URL.createObjectURL = () => 'blob:note'
  URL.revokeObjectURL = () => undefined
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
})

async function show(attachment: Record<string, unknown>): Promise<HTMLDivElement> {
  const hub = new Hub(config, { appName: 'Ayni' })
  hub.attachmentBlob = async () => new Blob(['audio'], { type: 'audio/webm' })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <HubContext.Provider value={hub}>
        <AttachmentView
          sessionId="s1"
          mine
          attachment={
            {
              attachmentId: 'att_1',
              type: 'voice',
              mimeType: 'audio/webm',
              textRepr: 'Call me back',
              ...attachment,
            } as never
          }
        />
      </HubContext.Provider>
    )
  })
  // the audio is fetched with the token, then given to the player
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return host
}

describe('the player of a voice note', () => {
  it('shows the length of the note before it is played, and its waveform as bars', async () => {
    const el = await show({ duration: 65, waveform: [0, 50, 100, 20] })
    expect(el.querySelector('.voice-time')?.textContent).toBe('1:05')
    const bars = [...el.querySelectorAll<HTMLElement>('.voice-bar')]
    expect(bars).toHaveLength(48)
    // four levels over the bars: quiet at the start, the loudest in the third quarter
    expect(bars[0]?.style.height).toBe('8%')
    expect(bars[30]?.style.height).toBe('100%')
    expect(el.querySelectorAll('.voice-bar.played')).toHaveLength(0)
    expect(el.querySelector('.voice-line')).toBeNull()
    expect(el.querySelector('button.voice-play')?.getAttribute('aria-label')).toBe('Play the voice note')
    expect(el.querySelector('.transcription')?.textContent).toContain('Call me back')
  })

  it('marks the part played as the note goes', async () => {
    const el = await show({ duration: 10, waveform: [10, 20, 30, 40] })
    const audio = el.querySelector('audio') as HTMLAudioElement
    Object.defineProperty(audio, 'currentTime', { value: 5, configurable: true })
    await act(async () => {
      audio.dispatchEvent(new Event('timeupdate'))
    })
    expect(el.querySelectorAll('.voice-bar.played')).toHaveLength(24)
    expect(el.querySelector('.voice-time')?.textContent).toBe('0:05')
    expect(el.querySelector('[role="slider"]')?.getAttribute('aria-valuetext')).toBe('0:05 / 0:10')
  })

  it('keeps the plain line for a note that carries no waveform, and reads its length from the audio', async () => {
    const el = await show({})
    expect(el.querySelectorAll('.voice-bar')).toHaveLength(0)
    expect(el.querySelector('.voice-line')).not.toBeNull()
    expect(el.querySelector('.voice-time')?.textContent).toBe('0:00')
    const audio = el.querySelector('audio') as HTMLAudioElement
    Object.defineProperty(audio, 'duration', { value: 7.4, configurable: true })
    await act(async () => {
      audio.dispatchEvent(new Event('loadedmetadata'))
    })
    expect(el.querySelector('.voice-time')?.textContent).toBe('0:07')
  })
})
