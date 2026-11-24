/** Client of the Ayni AG-UI Profile v3 endpoints (profile sections 3, 6, 8, 9). */
import type {
  AyniAction,
  BindingMaterial,
  ClientDescription,
  ConversationPatch,
  ConversationsResponse,
  CreateSessionResponse,
  DevicesResponse,
  HistoryPage,
  SessionStatus,
  UploadResponse,
} from '@ayni.org/ayni-agui-profile'
import {
  type Connection,
  type ConnectionAttempt,
  connectionAttemptOf,
  connectionOf,
  connectionsOf,
} from './connections.js'
import { type AboutMe, aboutMeOf, type Memories, memoriesOf } from './memories.js'
import { NOTIFICATIONS_PAGE, type NotificationsPage, notificationsPageOf } from './notifications.js'
import {
  type AdminChangesPage,
  type AdminRoleEntry,
  adminChangesOf,
  adminRolesOf,
  type DirectoryPerson,
  type OrganizationInfo,
  organizationsOf,
  peopleOf,
} from './people.js'
import { type RunEnd, runEvents } from './queue.js'
import {
  type SharedConversation,
  type SpaceActivityPage,
  type SpaceDetail,
  type SpaceInfo,
  type SpacePatch,
  type Spaces,
  sharedConversationsOf,
  spaceActivityOf,
  spaceDetailOf,
  spaceOf,
  spacesOf,
} from './spaces.js'
import { readSse } from './sse.js'
import {
  type ConversationSource,
  conversationSourcesOf,
  type SpaceTool,
  type SpaceToolAnswer,
  spaceToolOf,
  spaceToolsOf,
  type ToolRule,
} from './tools.js'
import { type VoiceMeasures, voiceMeasureFields } from './voiceNote.js'

export class ProfileError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly reason?: string,
    public readonly binding?: BindingMaterial,
    message?: string,
    /** the field a `400` or a `422 out-of-bounds` names (profile 3.3 §9) */
    public readonly field?: string,
    /**
     * for `422 wrong-binding` (profile 3.5 §3.11): the names of the value the space wants and of the one the account
     * is for
     */
    public readonly expected?: string,
    public readonly chosen?: string
  ) {
    super(message ?? `${status} ${code}`)
    this.name = 'ProfileError'
  }
}

export type AgUiEvent = Record<string, unknown> & { type: string }

export interface RunInput {
  runId: string
  text?: string
  action?: AyniAction
}

async function parseError(response: Response): Promise<ProfileError> {
  let body: {
    error?: string
    reason?: string
    message?: string
    binding?: BindingMaterial
    field?: string
    expected?: unknown
    chosen?: unknown
  } = {}
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
    body.message,
    typeof body.field === 'string' ? body.field : undefined,
    typeof body.expected === 'string' ? body.expected : undefined,
    typeof body.chosen === 'string' ? body.chosen : undefined
  )
}

export class ProfileClient {
  private readonly fetchFn: typeof fetch

  public constructor(
    private readonly sessionsUrl: string,
    fetchFn: typeof fetch = fetch
  ) {
    // a browser's fetch refuses to run as a method of another object ("Illegal invocation"). Every call goes with the
    // cache mode no-store (UI-SESS-020, PROF-ERR-003): a browser keys its cache on the URL and not on the token, and a
    // stored `410` of the list once answered the list of every later session, without the agent being asked
    this.fetchFn = (input, init) => fetchFn(input, { ...init, cache: 'no-store' })
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
    siblingOfToken?: string,
    deviceHandle?: string,
    resumeSessionId?: string,
    deviceProof?: string,
    conversationId?: string,
    newConversation = false,
    /** a bound session or none (PROF-SESS-015): 409 when the device proof does not bind, nothing asked on the phone */
    silent = false,
    /** the space a new conversation starts in (PROF-CONV-011); Personal without it */
    spaceId?: string
  ): Promise<CreateSessionResponse> {
    const response = await this.fetchFn(this.url(), {
      method: 'POST',
      headers: this.headers(siblingOfToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        client,
        locale,
        ...(deviceHandle && !siblingOfToken ? { deviceHandle } : {}),
        ...(deviceHandle && deviceProof && !siblingOfToken ? { deviceProof } : {}),
        ...(conversationId ? { conversationId } : resumeSessionId ? { resumeSessionId } : {}),
        ...(newConversation ? { newConversation: true } : {}),
        ...(newConversation && spaceId ? { spaceId } : {}),
        ...(silent && !siblingOfToken ? { silent: true } : {}),
      }),
    })
    if (!response.ok) throw await parseError(response)
    return response.json()
  }

  /** The Principal's conversations with this agent (PROF-CONV-001), of one space with `spaceId` (PROF-CONV-010). */
  public async conversations(token: string, spaceId?: string): Promise<ConversationsResponse> {
    const query = spaceId ? `?${new URLSearchParams({ spaceId })}` : ''
    const response = await this.fetchFn(this.url(`/conversations${query}`), { headers: this.headers(token) })
    if (!response.ok) throw await parseError(response)
    return response.json()
  }

  /** Rename, archive, unarchive (PROF-CONV-002/003), or change its space before its first message (PROF-CONV-011). */
  public async patchConversation(
    token: string,
    id: string,
    patch: ConversationPatch & { spaceId?: string }
  ): Promise<void> {
    const response = await this.fetchFn(this.url(`/conversations/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: this.headers(token, { 'content-type': 'application/json' }),
      body: JSON.stringify(patch),
    })
    if (!response.ok) throw await parseError(response)
  }

  /** Close for good (PROF-CONV-004). */
  public async deleteConversation(token: string, id: string): Promise<void> {
    const response = await this.fetchFn(this.url(`/conversations/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: this.headers(token),
    })
    if (!response.ok && response.status !== 404) throw await parseError(response)
  }

  /** The Principal's paired devices (PROF-SESS-011). */
  public async devices(token: string): Promise<DevicesResponse> {
    const response = await this.fetchFn(this.url('/devices'), { headers: this.headers(token) })
    if (!response.ok) throw await parseError(response)
    return response.json()
  }

  /** Revokes a pairing with a bound token, or with the device's own proof when no session is bound (PROF-SESS-012). */
  public async revokeDevice(handle: string, auth: { token: string } | { deviceProof: string }): Promise<void> {
    const response = await this.fetchFn(this.url(`/devices/${encodeURIComponent(handle)}`), {
      method: 'DELETE',
      headers: this.headers('token' in auth ? auth.token : undefined, { 'content-type': 'application/json' }),
      body: JSON.stringify('deviceProof' in auth ? { deviceProof: auth.deviceProof } : {}),
    })
    if (!response.ok && response.status !== 404) throw await parseError(response)
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

  /**
   * One run (profile section 6): only the new user message and the structured action of the turn. Against an
   * agent that takes it, a message sent during a turn is recorded and waits: its run ends at once with no turn,
   * and the reply comes later on the session stream (PROF-RUN-011/012). Resolves with how the run ended: empty for
   * a run that had its turn.
   */
  public async run(
    sessionId: string,
    token: string,
    input: RunInput,
    onEvent: (event: AgUiEvent) => void,
    signal: AbortSignal
  ): Promise<RunEnd> {
    const body = {
      threadId: sessionId,
      runId: input.runId,
      messages: input.text ? [{ id: `u_${input.runId}`, role: 'user', content: input.text }] : [],
      tools: [],
      context: [],
      forwardedProps: input.action ? { ayni: input.action } : undefined,
    }
    const response = await this.fetchFn(this.url(`/${sessionId}/runs`), {
      method: 'POST',
      headers: this.headers(token, { 'content-type': 'application/json', accept: 'text/event-stream' }),
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) throw await parseError(response)
    if (!response.body) return {}
    // a run that gets no turn (its message waits, or was refused) gives the caller no event: its end is returned
    // instead (PROF-RUN-013)
    const events = runEvents(onEvent)
    await readSse(response.body, (m) => events.onEvent(JSON.parse(m.data) as AgUiEvent), signal)
    return events.end()
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

  /**
   * Uploads a file before the turn that references it (UI-MEDIA-003). Its name goes in a field of its own, before
   * the file (PROF-HIST-008): platforms do not write the name of a multipart file alike, and the agent takes the
   * field as the name when it is there.
   */
  public async upload(
    sessionId: string,
    token: string,
    file: Blob,
    filename: string,
    /** what the recorder measured of a voice note (PROF-HIST-009) */
    measures?: VoiceMeasures
  ): Promise<UploadResponse> {
    const form = new FormData()
    form.append('filename', filename)
    // before the file, as the name is: an agent reads the fields it finds on its way to it
    for (const [name, value] of Object.entries(voiceMeasureFields(measures))) form.append(name, value)
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

  // ---- profile 3.3: deleting a message within the window (§8), spaces (§3.7), memories (§3.8), people (§3.9)

  private async getJson(token: string, path: string): Promise<unknown> {
    const response = await this.fetchFn(this.url(path), { headers: this.headers(token) })
    if (!response.ok) throw await parseError(response)
    return response.json()
  }

  private async send(token: string, method: string, path: string, body?: unknown): Promise<unknown> {
    return (await this.sendFor(token, method, path, body)).body
  }

  /** A request with its answer's status: a change of a space's tools applies (`200`) or waits (`202`, §3.10). */
  private async sendFor(
    token: string,
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; body: unknown }> {
    const response = await this.fetchFn(this.url(path), {
      method,
      headers: this.headers(token, body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!response.ok) throw await parseError(response)
    if (response.status === 204) return { status: 204, body: undefined }
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : undefined }
  }

  /** The tool of an answer of §3.10, `{ "tool" }`; a `502` for an answer that carries none. */
  private static toolOf(body: unknown): SpaceTool {
    const tool = spaceToolOf((body as { tool?: unknown } | undefined)?.tool)
    if (!tool) throw new ProfileError(502, 'bad-response')
    return tool
  }

  private async toolChange(token: string, method: string, path: string, body?: unknown): Promise<SpaceToolAnswer> {
    const answer = await this.sendFor(token, method, path, body)
    return { status: answer.status === 202 ? 202 : 200, tool: ProfileClient.toolOf(answer.body) }
  }

  /**
   * Deletes a message the person wrote, with the agent's reply to it, within the window (PROF-HIST-010): named by
   * the agent's id or by the client's own. `409 window-passed`, `409 legal-hold` and `404` reach the caller.
   */
  public async deleteMessage(sessionId: string, token: string, messageId: string): Promise<void> {
    await this.send(token, 'DELETE', `/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`)
  }

  /** Shares a conversation with its own space (PROF-CONV-012). */
  public async share(token: string, conversationId: string): Promise<{ shared: true; sharedAt: string }> {
    return (await this.send(token, 'POST', `/conversations/${encodeURIComponent(conversationId)}/share`)) as never
  }

  /** Stops sharing it (PROF-CONV-012). */
  public async unshare(token: string, conversationId: string): Promise<void> {
    await this.send(token, 'DELETE', `/conversations/${encodeURIComponent(conversationId)}/share`)
  }

  /** Personal, the person's spaces and the templates they may create from (PROF-SPACE-001). */
  public async spaces(token: string): Promise<Spaces> {
    return spacesOf(await this.getJson(token, '/spaces'))
  }

  /** A new space of a template, owned by the person (PROF-SPACE-002). */
  public async createSpace(
    token: string,
    input: { templateId: string; title: string; purpose: string; brief?: string }
  ): Promise<SpaceInfo> {
    const space = spaceOf(await this.send(token, 'POST', '/spaces', input))
    if (!space) throw new ProfileError(502, 'bad-response')
    return space
  }

  /** A space and, for an active member of a list space, its members (PROF-SPACE-003). */
  public async space(token: string, spaceId: string): Promise<SpaceDetail> {
    const detail = spaceDetailOf(await this.getJson(token, `/spaces/${encodeURIComponent(spaceId)}`))
    if (!detail) throw new ProfileError(502, 'bad-response')
    return detail
  }

  /** The owner changes a space within its template's bounds (PROF-SPACE-004). */
  public async patchSpace(token: string, spaceId: string, patch: SpacePatch): Promise<SpaceInfo> {
    const space = spaceOf(await this.send(token, 'PATCH', `/spaces/${encodeURIComponent(spaceId)}`, patch))
    if (!space) throw new ProfileError(502, 'bad-response')
    return space
  }

  /** Adds a person of the employee list, or invites one of another organization by email (PROF-SPACE-005). */
  public async addMember(
    token: string,
    spaceId: string,
    who: { directoryId: string } | { organizationKey: string; email: string }
  ): Promise<void> {
    await this.send(token, 'POST', `/spaces/${encodeURIComponent(spaceId)}/members`, who)
  }

  public async removeMember(token: string, spaceId: string, memberId: string): Promise<void> {
    await this.send(token, 'DELETE', `/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(memberId)}`)
  }

  /** Hands the space to a member of a list space, or to a person of the directory for a rule space (PROF-SPACE-006). */
  public async transferOwnership(
    token: string,
    spaceId: string,
    to: { memberId: string } | { directoryId: string }
  ): Promise<void> {
    await this.send(token, 'POST', `/spaces/${encodeURIComponent(spaceId)}/owner`, to)
  }

  /** The space's activity, newest first (PROF-SPACE-006). */
  public async spaceActivity(token: string, spaceId: string, before?: string, limit = 50): Promise<SpaceActivityPage> {
    const query = new URLSearchParams({ limit: String(limit), ...(before ? { before } : {}) })
    return spaceActivityOf(await this.getJson(token, `/spaces/${encodeURIComponent(spaceId)}/activity?${query}`))
  }

  /** The conversations shared with a space (PROF-SPACE-007). */
  public async sharedConversations(token: string, spaceId: string): Promise<SharedConversation[]> {
    return sharedConversationsOf(await this.getJson(token, `/spaces/${encodeURIComponent(spaceId)}/shared`))
  }

  /** A shared conversation's history, read-only, in the shape of §8 (PROF-SPACE-007). */
  public async sharedHistory(
    token: string,
    spaceId: string,
    conversationId: string,
    before?: string,
    limit = 50
  ): Promise<HistoryPage> {
    const query = new URLSearchParams({ limit: String(limit), ...(before ? { before } : {}) })
    return (await this.getJson(
      token,
      `/spaces/${encodeURIComponent(spaceId)}/shared/${encodeURIComponent(conversationId)}/messages?${query}`
    )) as HistoryPage
  }

  /** An attachment of a shared conversation (PROF-SPACE-007). */
  public async sharedAttachment(
    token: string,
    spaceId: string,
    conversationId: string,
    attachmentId: string
  ): Promise<Blob> {
    const response = await this.fetchFn(
      this.url(
        `/spaces/${encodeURIComponent(spaceId)}/shared/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachmentId)}`
      ),
      { headers: this.headers(token) }
    )
    if (!response.ok) throw await parseError(response)
    return response.blob()
  }

  /** The person's preferences, and their memories of every space or of one (PROF-MEM-001). */
  public async memories(token: string, spaceId?: string): Promise<Memories> {
    const query = spaceId ? `?${new URLSearchParams({ spaceId })}` : ''
    return memoriesOf(await this.getJson(token, `/memories${query}`))
  }

  /** Deletes a memory of the person, for good (PROF-MEM-002). */
  public async deleteMemory(token: string, memoryId: string): Promise<void> {
    await this.send(token, 'DELETE', `/memories/${encodeURIComponent(memoryId)}`)
  }

  /** Deletes a preference of the person, by its name, percent-encoded (PROF-MEM-002). */
  public async deletePreference(token: string, key: string): Promise<void> {
    await this.send(token, 'DELETE', `/preferences/${encodeURIComponent(key)}`)
  }

  /** What the agent keeps about the person (PROF-MEM-003). */
  public async aboutMe(token: string): Promise<AboutMe> {
    return aboutMeOf(await this.getJson(token, '/about-me'))
  }

  // ---- profile 3.4: the tools of a space (§3.10), the sources of a conversation and its allowances (§3.6)

  private static toolsPath(spaceId: string, source?: string, rest = ''): string {
    return `/spaces/${encodeURIComponent(spaceId)}/tools${source ? `/${encodeURIComponent(source)}` : ''}${rest}`
  }

  /** The tools of a space: every source of its template to its owner, the `ready` ones to a member (PROF-TOOL-001). */
  public async spaceTools(token: string, spaceId: string): Promise<SpaceTool[]> {
    return spaceToolsOf(await this.getJson(token, ProfileClient.toolsPath(spaceId)))
  }

  /** The owner adds a source the template offers, or switches an `off` one back on: `202`, waiting (PROF-TOOL-002). */
  public async addSpaceTool(
    token: string,
    spaceId: string,
    input: { source: string; bindings?: Record<string, string>; calls?: Record<string, ToolRule> }
  ): Promise<SpaceToolAnswer> {
    return this.toolChange(token, 'POST', ProfileClient.toolsPath(spaceId), input)
  }

  /** The owner changes bindings and rules: `200` when it only narrows, `202` when it grants (PROF-TOOL-003). */
  public async patchSpaceTool(
    token: string,
    spaceId: string,
    source: string,
    patch: { bindings?: Record<string, string>; calls?: Record<string, ToolRule> }
  ): Promise<SpaceToolAnswer> {
    return this.toolChange(token, 'PATCH', ProfileClient.toolsPath(spaceId, source), patch)
  }

  /**
   * The owner sets or replaces the space's account, every declared field together (`{ values: { <name>: <value> } }`):
   * `202`, waiting (PROF-TOOL-004). The values are sent and kept nowhere.
   */
  public async setSpaceToolAccount(
    token: string,
    spaceId: string,
    source: string,
    values: Record<string, string>
  ): Promise<SpaceToolAnswer> {
    return this.toolChange(token, 'PUT', ProfileClient.toolsPath(spaceId, source, '/account'), { values })
  }

  /** The owner clears the space's account, at once (PROF-TOOL-004). */
  public async clearSpaceToolAccount(token: string, spaceId: string, source: string): Promise<SpaceTool> {
    return ProfileClient.toolOf(await this.send(token, 'DELETE', ProfileClient.toolsPath(spaceId, source, '/account')))
  }

  /** The owner removes a source from the space, at once: `available` or `off` again (PROF-TOOL-005). */
  public async removeSpaceTool(token: string, spaceId: string, source: string): Promise<SpaceTool> {
    return ProfileClient.toolOf(await this.send(token, 'DELETE', ProfileClient.toolsPath(spaceId, source)))
  }

  /** The owner withdraws the change that waits for the phone (PROF-TOOL-005). */
  public async withdrawSpaceToolChange(token: string, spaceId: string, source: string): Promise<void> {
    await this.send(token, 'DELETE', ProfileClient.toolsPath(spaceId, source, '/pending'))
  }

  /** The sources of the tool results a conversation holds, for its Principal (PROF-TOOL-011). */
  public async conversationSources(token: string, conversationId: string): Promise<ConversationSource[]> {
    return conversationSourcesOf(
      await this.getJson(token, `/conversations/${encodeURIComponent(conversationId)}/sources`)
    )
  }

  /** Ends the allowance a confirmation gave ("Allow for this conversation", PROF-TOOL-012). */
  public async endAllowance(token: string, conversationId: string, approvalId: string): Promise<void> {
    await this.send(
      token,
      'DELETE',
      `/conversations/${encodeURIComponent(conversationId)}/allowances/${encodeURIComponent(approvalId)}`
    )
  }

  // ---- profile 3.5: the person's own accounts (§3.11)

  /** The item of an answer of §3.11, `{ "connection" }`; a `502` for an answer that carries none. */
  private static connectionIn(body: unknown): Connection {
    const connection = connectionOf((body as { connection?: unknown } | undefined)?.connection)
    if (!connection) throw new ProfileError(502, 'bad-response')
    return connection
  }

  /** The person's own accounts, held or to connect (PROF-TOOL-014). */
  public async connections(token: string): Promise<Connection[]> {
    return connectionsOf(await this.getJson(token, '/connections'))
  }

  /**
   * Starts the sign-in of an account of OAuth: `202` with the URL to open in the browser (PROF-TOOL-015). `spaceId`
   * for a source of a space's template.
   */
  public async authorizeConnection(token: string, source: string, spaceId?: string): Promise<ConnectionAttempt> {
    const attempt = connectionAttemptOf(
      await this.send(token, 'POST', `/connections/${encodeURIComponent(source)}/authorize`, spaceId ? { spaceId } : {})
    )
    if (!attempt) throw new ProfileError(502, 'bad-response')
    return attempt
  }

  /** Ends a sign-in that waits (PROF-TOOL-015): `204`; `404` when it no longer waits. */
  public async cancelConnectionAttempt(token: string, attemptId: string): Promise<void> {
    await this.send(token, 'DELETE', `/connections/attempts/${encodeURIComponent(attemptId)}`)
  }

  /**
   * Sets an account of fields, at once (PROF-TOOL-016): one value per field, sent and kept nowhere. `spaceId` for a
   * source of a space's template.
   */
  public async setConnectionAccount(
    token: string,
    source: string,
    values: Record<string, string>,
    spaceId?: string
  ): Promise<Connection> {
    return ProfileClient.connectionIn(
      await this.send(token, 'PUT', `/connections/${encodeURIComponent(source)}/account`, {
        values,
        ...(spaceId ? { spaceId } : {}),
      })
    )
  }

  /** Disconnects an account, at once: its item, `not-connected` (PROF-TOOL-017). */
  public async disconnectAccount(token: string, accountId: string): Promise<Connection> {
    return ProfileClient.connectionIn(
      await this.send(token, 'DELETE', `/connections/accounts/${encodeURIComponent(accountId)}`)
    )
  }

  // ---- the Notifications of a space and of the agent (§3.12, agent D114)

  /**
   * The Notifications of a space, or the agent's for `spaceId` null, newest first (PROF-TOOL-024): the approvals the
   * person may decide, could decide while they waited, or asked for. `before`, the id of the last one read.
   */
  public async notifications(
    token: string,
    spaceId: string | null,
    before?: string,
    limit: number = NOTIFICATIONS_PAGE.default
  ): Promise<NotificationsPage> {
    const query = new URLSearchParams({
      limit: String(Math.min(Math.max(1, Math.floor(limit)), NOTIFICATIONS_PAGE.max)),
      ...(before ? { before } : {}),
    })
    const path = spaceId ? `/spaces/${encodeURIComponent(spaceId)}/notifications` : '/notifications'
    return notificationsPageOf(await this.getJson(token, `${path}?${query}`))
  }

  /**
   * Decide on your phone (PROF-TOOL-026): the request of an approval to attest sent to the person's phone again, the
   * one it held closed; `202` with its expiry. `404`, `409 not-pending` and `409 confirmation-unavailable` reach the
   * caller.
   */
  public async resendApproval(token: string, approvalId: string): Promise<{ expiresAt: string }> {
    const body = (await this.send(token, 'POST', `/approvals/${encodeURIComponent(approvalId)}/resend`)) as
      | { expiresAt?: unknown }
      | undefined
    return { expiresAt: typeof body?.expiresAt === 'string' ? body.expiresAt : '' }
  }

  /** The people of the employee list whose name contains `q`, for the member picker (PROF-DIR-001). */
  public async directory(token: string, q: string): Promise<DirectoryPerson[]> {
    return peopleOf(await this.getJson(token, `/directory?${new URLSearchParams({ q })}`))
  }

  /** The organizations of the trust graph whose name contains `q` (PROF-DIR-002). */
  public async organizations(token: string, q: string): Promise<OrganizationInfo[]> {
    return organizationsOf(await this.getJson(token, `/organizations?${new URLSearchParams({ q })}`))
  }

  /** Who holds which role and why, for the holders of the admin role (PROF-DIR-003); `403 not-admin` otherwise. */
  public async adminRoles(token: string): Promise<AdminRoleEntry[]> {
    return adminRolesOf(await this.getJson(token, '/admin/roles'))
  }

  /** The changes of the employee list, newest first (PROF-DIR-003). */
  public async adminChanges(token: string, before?: string, limit = 50): Promise<AdminChangesPage> {
    const query = new URLSearchParams({ limit: String(limit), ...(before ? { before } : {}) })
    return adminChangesOf(await this.getJson(token, `/admin/changes?${query}`))
  }
}
