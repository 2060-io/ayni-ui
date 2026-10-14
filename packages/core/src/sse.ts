/** Server-Sent Events over fetch (so that the Authorization header and Last-Event-ID can be sent). */
export interface SseMessage {
  id?: string
  event?: string
  data: string
}

export async function readSse(
  body: ReadableStream<Uint8Array>,
  onMessage: (m: SseMessage) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let current: SseMessage = { data: '' }
  const flush = () => {
    if (current.data) onMessage({ ...current, data: current.data.replace(/\n$/, '') })
    current = { data: '' }
  }
  const onAbort = () => reader.cancel().catch(() => undefined)
  signal?.addEventListener('abort', onAbort)
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '')
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
        if (line === '') flush()
        else if (line.startsWith(':')) continue
        else {
          const idx = line.indexOf(':')
          const field = idx < 0 ? line : line.slice(0, idx)
          const value = idx < 0 ? '' : line.slice(idx + 1).replace(/^ /, '')
          if (field === 'data') current.data += `${value}\n`
          else if (field === 'id') current.id = value
          else if (field === 'event') current.event = value
        }
      }
    }
    flush()
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}
