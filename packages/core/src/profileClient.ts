/** Client of the Hologram AG-UI Profile v3 endpoints (profile sections 3, 6, 8, 9). */
import type {
  BindingMaterial,
  ClientDescription,
  CreateSessionResponse,
  HistoryPage,
  HologramAction,
  SessionStatus,
  UploadResponse,
} from '@2060.io/hologram-agui-profile'
import { readSse } from './sse.js'

export class ProfileError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly reason?: string,
    public readonly binding?: BindingMaterial,
    message?: string
  ) {
    super(message ?? `${status} ${code}`)
    this.name = 'ProfileError'
  }
}

export type AgUiEvent = Record<string, unknown> & { type: string }

export interface RunInput {
  runId: string
  text?: string
  action?: HologramAction
  resume?: { interruptId: string; status: 'resolved' | 'cancelled'; payload?: unknown }[]
}

async function parseError(response: Response): Promise<ProfileError> {
  let body: { error?: string; reason?: string; message?: string; binding?: BindingMaterial } = {}
  try {
    body = await response.json()
  } catch {
    // no body
  }
  return new ProfileError(
    response.status,
    body.error ?? String(response.status),
    body.reason,
    body.binding,
    body.message
  )
}

export class ProfileClient {
  private readonly fetchFn: typeof fetch

  public constructor(
    private readonly sessionsUrl: string,
    fetchFn: typeof fetch = fetch
  ) {
    // a browser's fetch refuses to run as a method of another object ("Illegal invocation")
    this.fetchFn = (input, init) => fetchFn(input, init)
  }

  private url(path = ''): string {
    return `${this.sessionsUrl.replace(/\/+$/, '')}${path}`
  }

  private headers(token?: string, extra: Record<string, string> = {}): Record<string, string> {
    return { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }
  }

  public async create(
    client: ClientDescription,
    locale?: string,
    siblingOfToken?: string
  ): Promise<CreateSessionResponse> {
    const response = await this.fetchFn(this.url(), {
      method: 'POST',
      headers: this.headers(siblingOfToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ client, locale }),
    })
    if (!response.ok) throw await parseError(response)
    return response.json()
  }

  public async status(sessionId: string, token: string): Promise<SessionStatus> {
    const response = await this.fetchFn(this.url(`/${sessionId}`), { headers: this.headers(token) })
    if (!response.ok) throw await parseError(response)
    return response.json()
  }

  public async refreshBinding(sessionId: string, token: string): Promise<BindingMaterial> {
    const response = await this.fetchFn(this.url(`/${sessionId}/binding`), {
      method: 'POST',
      headers: this.headers(token),
    })
    if (response.status === 409) {
      const err = await parseError(response)
      if (err.binding) return err.binding
      throw err
    }
    if (!response.ok) throw await parseError(response)
    return (await response.json()).binding as BindingMaterial
  }

  public async close(sessionId: string, token: string): Promise<void> {
    const response = await this.fetchFn(this.url(`/${sessionId}`), { method: 'DELETE', headers: this.headers(token) })
    if (!response.ok && response.status !== 410 && response.status !== 404) throw await parseError(response)
  }

  /** The long-lived session stream (profile section 5); resolves when the stream ends. */
  public async stream(
    sessionId: string,
    token: string,
    lastEventId: number | undefined,
    onEvent: (event: AgUiEvent, id?: number) => void,
    signal: AbortSignal
  ): Promise<void> {
    const response = await this.fetchFn(this.url(`/${sessionId}/stream`), {
      headers: this.headers(token, {
        accept: 'text/event-stream',
        ...(lastEventId !== undefined ? { 'last-event-id': String(lastEventId) } : {}),
      }),
      signal,
    })
    if (!response.ok) throw await parseError(response)
    if (!response.body) return
    await readSse(
      response.body,
      (m) => onEvent(JSON.parse(m.data) as AgUiEvent, m.id !== undefined ? Number(m.id) : undefined),
      signal
    )
  }

  /** One run (profile section 6): only the new user message and the structured action of the turn. */
  public async run(
    sessionId: string,
    token: string,
    input: RunInput,
    onEvent: (event: AgUiEvent) => void,
    signal: AbortSignal
  ): Promise<void> {
    const body = {
      threadId: sessionId,
      runId: input.runId,
      messages: input.text ? [{ id: `u_${input.runId}`, role: 'user', content: input.text }] : [],
      tools: [],
      context: [],
      forwardedProps: input.action ? { hologram: input.action } : undefined,
      resume: input.resume,
    }
    const response = await this.fetchFn(this.url(`/${sessionId}/runs`), {
      method: 'POST',
      headers: this.headers(token, { 'content-type': 'application/json', accept: 'text/event-stream' }),
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) throw await parseError(response)
    if (!response.body) return
    await readSse(response.body, (m) => onEvent(JSON.parse(m.data) as AgUiEvent), signal)
  }

  public async cancel(sessionId: string, token: string, runId: string): Promise<boolean> {
    const response = await this.fetchFn(this.url(`/${sessionId}/runs/${runId}/cancel`), {
      method: 'POST',
      headers: this.headers(token),
    })
    return response.status === 202
  }

  public async history(sessionId: string, token: string, before?: string, limit = 50): Promise<HistoryPage> {
    const query = new URLSearchParams({ limit: String(limit), ...(before ? { before } : {}) })
    const response = await this.fetchFn(this.url(`/${sessionId}/messages?${query}`), { headers: this.headers(token) })
    if (!response.ok) throw await parseError(response)
    return response.json()
  }

  public async upload(sessionId: string, token: string, file: Blob, filename: string): Promise<UploadResponse> {
    const form = new FormData()
    form.append('file', file, filename)
    const response = await this.fetchFn(this.url(`/${sessionId}/attachments`), {
      method: 'POST',
      headers: this.headers(token),
      body: form,
    })
    if (!response.ok) throw await parseError(response)
    return response.json()
  }

  /** Attachments are fetched with the token and shown as revocable object URLs (UI-MEDIA-001). */
  public async attachment(sessionId: string, token: string, attachmentId: string): Promise<Blob> {
    const response = await this.fetchFn(this.url(`/${sessionId}/attachments/${attachmentId}`), {
      headers: this.headers(token),
    })
    if (!response.ok) throw await parseError(response)
    return response.blob()
  }
}
