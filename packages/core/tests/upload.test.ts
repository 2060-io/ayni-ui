/**
 * The body of an upload (UI-MEDIA-003, PROF-HIST-008): the file's name in a field of its own, before the file.
 */
import { describe, expect, it } from 'vitest'
import { ProfileClient } from '../src/profileClient.js'

describe('an upload', () => {
  it('gives the name of the file as written, before the file', async () => {
    let sent: { url: string; init?: RequestInit } | undefined
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent = { url: String(input), init }
      return new Response(
        JSON.stringify({ attachmentId: 'att_1', type: 'file', mimeType: 'application/pdf', size: 5 }),
        {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }
      )
    }) as typeof fetch
    const client = new ProfileClient('https://agent.test/agui/v3/sessions', fetchFn)
    const file = new Blob(['hello'], { type: 'application/pdf' })
    const result = await client.upload('ses_1', 'tok', file, 'Terms of service 100%.pdf')

    expect(result.attachmentId).toBe('att_1')
    expect(sent?.url).toBe('https://agent.test/agui/v3/sessions/ses_1/attachments')
    const form = sent?.init?.body as FormData
    expect([...form.keys()]).toEqual(['filename', 'file'])
    expect(form.get('filename')).toBe('Terms of service 100%.pdf')
    expect((form.get('file') as File).name).toBe('Terms of service 100%.pdf')
  })
})
