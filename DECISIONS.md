# Implementation decisions

1. **Stack.** TypeScript, Vite, React 19, a framework-independent core package (`packages/core`)
   that depends only on web platform primitives (fetch, streams, IndexedDB through `idb`,
   BroadcastChannel, Web Locks). Project conventions from `2060-io/ts-project-template` (Biome,
   pnpm, vitest, reusable CI/CD, Helm chart).
2. **Profile package.** The wire types come from `@2060.io/ayni-agui-profile`, whose source of
   truth is `ayni-agent/packages/agui-profile`. Until it is published to a registry the package
   is copied here (`packages/agui-profile`, `SOURCE` records the commit, `scripts/sync-profile.sh`
   refreshes it) so that CI builds without access to the agent repository.
3. **AG-UI transport.** The profile's session stream carries `Last-Event-ID` and a bearer token, which
   `EventSource` cannot send, so both the stream and the runs use `fetch` with a small SSE reader
   (`core/sse.ts`); events are reduced by one reducer (`core/reducer.ts`) for runs and the stream
   alike. `@ag-ui/client` is listed as a dependency for its types but the transport is ours, for
   the same reason.
4. **Leadership.** One tab per session holds a Web Lock named by the session id; it owns the stream,
   runs, history and attachment fetches. Other tabs render from IndexedDB and receive change
   notices on the broadcast channel; their actions are posted to the leader and acknowledged; when
   no leader answers within four seconds the tab takes the lock and acts.
5. **Trust resolution** runs against the Verifiable Trust resolution service (the indexer's
   `/v4/verifiable-trust/resolve`), the same service the wallet app queries; a DID's descriptor is
   its `AyniAgUI` service in the resolved services. No DID resolver is embedded.
6. **CSP.** The policy is static: `connect-src 'self' https:` plus the configured agent origins;
   origins added at runtime are not appended to the header (a header cannot change at runtime).
   The agent list in the store is the runtime allow-list for calls the UI makes.
7. **Inline menus** are answered with `menu.select` (the agent delivers them as activities and does
   not suspend runs with interrupts).
8. **Closure.** A `410` or a `ayni.session.state{closed}` deletes the token, keeps the transcript
   read-only, shows the reason in plain words and offers one-click re-binding; channel-level reasons
   close every conversation of the agent (the agent closes them; the UI reflects each).
9. **Voice notes** use `MediaRecorder` with the first supported container among webm/opus, ogg/opus
   and mp4; the agent lists accepted types in the descriptor.
10. **Message actions** (UI-CONV-017). A toolbar appears at the edge of a message on hover, focus
    or while one of its popovers is open: react, reply, more. Right-click opens the same menu as
    "more"; on touch screens a long press opens a bottom sheet with the quick reactions and the
    menu. Menu items: Reply, React, Copy text, Copy as Markdown (agent messages), Edit and resend
    (own messages), Message info. Forward, Select, Pin and Delete were left out on purpose: the
    transcript is sealed on the agent side and a delete would only hide locally.
11. **Reactions** (UI-CONV-011). One reaction per person per message, rendered as a pill overlapping
    the inner bottom corner of the bubble, the same on both sides; the viewer's own reaction is
    highlighted and reopens the quick bar, where picking another replaces it and picking the same
    removes it. The quick bar holds six emojis; "more" opens a bundled picker (search by English
    name, recently used from the preferences, five categories). No emoji dataset is downloaded:
    the set ships in `src/emoji.ts` so it works offline and under the CSP. Reactions come back from
    history through `metadata.reactions`.
12. **Replies** (UI-CONV-018). Reply puts a quote strip above the composer; the run carries
    `replyTo` and the sent bubble shows the quote, which scrolls to the original.
13. **Message info** (UI-CONV-019) replaces the right panel's content for one message: time,
    outcome, reply, reactions, the step labels received while the reply streamed, and the ids.
    The step labels are the UI's own record of the run; the agent keeps tool calls off the wire.
14. **Transcript and composer** (UI-CONV-012/013/016, UI-SHELL-011/014). No scrollbar and no
    "more" button: older pages load when the top comes into view, keeping the scroll position;
    the thinking indicator is three bouncing dots; the composer is one line that grows to six,
    with a plus for attachments, a microphone and a round send button; the right panel hides from
    a header toggle (a preference of the browser profile); the rail shows pinned agents above a
    pin separator and drag and drop across it pins or unpins, within it reorders.
15. **Paired devices** (D30, UI-BIND-011, UI-SESS-010, UI-AGENTS-006). The agent's device handle
    and secret live on the agent record in IndexedDB; every new session of that agent sends them as
    `deviceProof` and the agent binds it at once, so an idle closure costs nothing on the next
    message. The rotated secret returned by each bound session (create response, bound event, or the
    status of a freshly bound session) replaces the stored one; a `pairing: expired|invalid` answer
    drops it and the ordinary binding screen appears. "Disconnect from this agent" revokes the
    pairing with the proof, ends the conversations and clears their local data; "Linked devices"
    lists the paired browsers from the agent and unlinks any of them.
16. **The list is the agent's** (D31, UI-SESS-001/004/011/012/013). After every binding and on every
    reconnect the hub fetches the agent's conversations and reconciles the local records by
    conversation id: titles and archived state come from the agent, conversations opened elsewhere
    become records with no session (their id is the conversation id) and open silently on a paired
    device when selected, conversations the agent no longer lists are dropped. Archive and unarchive
    go through the agent and close the session; "Archive all" replaces "End all conversations";
    "Close for good" asks for confirmation, calls the conversation delete and clears the local data.
    Renames go through the agent too. Records from before this change (no conversation id) stay
    listed and attach to a conversation the next time they bind.
17. **Controller-first shell** (D32, UI-SHELL-001/002/011/014, UI-AGENTS-001). The rail shows
    controllers: `ControllerRecord`s in a new IndexedDB store (database version 2), keyed by the ECS
    Organization or Persona credential subject that the trust resolution now exposes as
    `operator.did`; an untrusted or unverified agent files under its own DID as a greyed tile. Agents
    carry `controllerDid`; records from before are filed on the first load, and a trust re-check that
    moves an agent to another controller moves it and shows a toast. Pinning and drag and drop apply
    to controllers. The column lists the selected controller's agents as cards (trust icon, menu,
    link state, new conversation, search, active or archived conversations). The plus tile opens a
    page with two entries, Trust Graph search and add by DID or URL. There is no permanent right
    panel: a side sheet appears for message info and closes from its own control. The conversation
    header keeps back, title, search and the contextual menu.
18. **One session per conversation per device; three streams** (D34, UI-SESS-014, UI-SHELL-016). A
    conversation row is a conversation, never a session: opening a listed or closed conversation that is
    already live on this device selects the live session; duplicates that slip through (double click,
    reload mid-flight) collapse to one, the extra sessions closed on the agent, their transcript kept
    when the survivor has none. List reconciliation is serialized so one call cannot write back a
    record another just dropped. At most three session streams stay open per agent: the one on screen
    always, then the most recently active; the rest are parked (bound, not streaming) and stream again
    when selected or when a slot frees. Found live: five duplicated sessions on one conversation each
    held a stream, and the browser's six connections per host were gone, so archive and every other
    request queued forever.
19. **Renamed from Hologram to Ayni** (2026-10-14). App name, packages (`@2060.io/ayni-ui-core`,
    `@2060.io/ayni-agui-profile`), Helm chart `ayni-ui` and every wire identifier follow the agent's
    rename (`ayni.*` events, `forwardedProps.ayni`, `state.ayni`, `/.well-known/ayni-agent.json`).
    The phone app is referred to as "the wallet app" in every language; its deep link domain is
    unchanged until the app itself is renamed.
20. **Transcript writes are serialized** (UI-CONV-003, UI-SESS-003). The session stream, a run, a
    history reload, a resume and the collapse of duplicate records all read a transcript, change it
    and write it back. Two in flight at once lost the change of whichever wrote first: writing on a
    conversation after its session had timed out made the new session's stream replay the bound
    event, which reloads history, while the send appended the person's message; the reload's read
    was taken before the append and written after it, and the message vanished while the agent's
    answer arrived. Every such read-modify-write now runs on one queue, one after the other, and a
    transcript loaded for display never replaces one that changed meanwhile. A test forces the
    losing order with IndexedDB-like reads (taken at once, delivered later).
21. **The whole rail is the drop surface; the pin line always shows; Pin and Unpin live in the tile's
    context menu** (UI-SHELL-011, D28). Dropping was only accepted on the two zones themselves, and
    the unpinned zone is one tile tall when few agents are known: a pinned tile dragged "down" landed
    on the spacer under the plus tile, where nothing accepted it, so dragging could pin but not
    unpin. The rail element now takes every drop and decides by position: above the midline of the
    separator pins (before the pinned tile under the pointer, or last), below it unpins, wherever the
    pointer is. The separator and its pin icon are rendered even when nothing is pinned, so the area
    above the line can be found; it grows to one slot while a tile is dragged. The controller header
    lost its three-dot menu, whose only item was Pin or Unpin; a right-click, a long press or the
    keyboard's context-menu key on a rail tile opens a one-item menu with the same, which keeps
    pinning reachable without a pointer drag.
22. **Not done.** Browser-side calls, push notifications (by design), E2E encrypted cache (v4),
    automated accessibility audit in CI (axe) and a browser end-to-end test suite.
