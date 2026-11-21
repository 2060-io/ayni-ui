# Implementation decisions

1. **Stack.** TypeScript, Vite, React 19, a framework-independent core package (`packages/core`)
   that depends only on web platform primitives (fetch, streams, IndexedDB through `idb`,
   BroadcastChannel, Web Locks). Project conventions from `2060-io/ts-project-template` (Biome,
   pnpm, vitest, reusable CI/CD, Helm chart).
2. **Profile package.** The wire types come from `@ayni.org/ayni-agui-profile`, whose source of
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
19. **Renamed from Hologram to Ayni** (2026-10-14). App name, packages (`@ayni.org/ayni-ui-core`,
    `@ayni.org/ayni-agui-profile`), Helm chart `ayni-ui` and every wire identifier follow the agent's
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
22. **One session opening at a time per agent; a never-bound conversation closes without the
    phone** (UI-BIND-012, UI-SESS-004). Seen live on 2026-10-23: two session openings reached the
    agent in the same second with the same device secret. The agent rotated it on the first and, as
    IDENT-DEV-003 requires, read the second as a stale secret and revoked the pairing, so every new
    conversation asked for the phone again. Four paths open a session with the proof (a listed
    conversation clicked, a closed one written on, New conversation, and rename/archive/close when
    nothing is bound), each after a trust re-check and a descriptor refresh that widen the window.
    They now share one lock per agent (the Web Locks API across tabs, a promise chain within one),
    and an opening that finds a session bound when its turn comes becomes that session's sibling
    and carries no proof. The agent stays strict: the revocation is what protects against a copied
    secret. In the same change, an action that needs the agent (rename, archive, delete) on an
    unpaired device no longer opens a provisional session as a side effect, and "Close for good" is
    offered on a conversation that never bound: its provisional session is closed and the row leaves,
    with no phone involved.
23. **The About page's illustrations are bundled and fetched at start** (UI-SHELL-017). They lived
    under `/brand/`, which nginx serves with `no-cache` so that a deployment can swap the brand
    files, and were fetched when the page opened: three requests and a visible delay at every
    press of the mark. They are the app's own content, not a deployment's brand, so they now ship
    through the bundle under a hashed name (cached for a year, immutable), the shell fetches them
    once at start and keeps the image elements, and the page decodes them with the frame. The
    mark and the logo stay under `/brand/`, swappable.
24. **Stable rail** (v4 D37, UI-SHELL-011). The rail is ordered by relationship, never by time: pinned
    controllers in the person's order, then the identified ones (an agent of theirs issued the person a
    credential, known from a completed `issue` flow card, kept as `identifiedAt` on the controller), then
    the others, both in connection order (the first agent's `addedAt`), then the unverified tiles. A
    message or an unread count moves nothing; a controller moves to the identified group once, with a
    toast, when its first credential arrives, on the stream or from history. Supersedes the recency
    order of entries 12 and 17.
25. **One conversation, every device** (2026-11-11; UI-CONV-022, PROF-STREAM-005, PROF-HIST-007). The agent
    now sends what another device adds to a conversation on this session's stream; the reducer already
    placed a text message by its role and id, so a message typed on the phone shows on the person's side
    here as it arrives. Two things were missing:
    - **Catch-up.** History was read only for an empty transcript. It is now read every time a stream
      attaches (`hub.catchUp`): the newest pages, going back until one reaches what the browser holds
      (`readCatchUp`, `catchUp` in the core). The transcript keeps its own paging position; when more was
      missed than four pages, it starts over from what was read, so it never shows a hole.
    - **A replayed message keeps its place.** A stream replays its events after a reconnect; a message
      already held keeps its time and so its position.
26. **The column follows a rename made elsewhere** (2026-11-11; UI-SESS-015, PROF-CONV-007). A conversation
    renamed, archived or closed from the phone kept its old line here until the next reconnect: nothing told
    the browser. The agent now sends `ayni.conversation.changed` on the person's session streams; the reducer
    turns it into the `conversations` signal and the hub reads the agent's list again.
27. **The agent-is-working indicator is in the shared design** (2026-11-11; UI-CONV-016). Its bubble, its
    three dots with their bounce, its wording and the rule of when it shows (`progressOf`) moved to the core
    (0.3.3) so that the Ayni app shows the same; nothing changes in the browser.
28. **Linked means paired** (2026-11-12, Fabrice: "it looks like my device is linked as I can use the
    conversations, but it says Not linked"; UI-AGENTS-007). The agent card read "linked" from a session
    bound at that moment. A linked browser's sessions close when idle and the next click opens one silently
    with the device pairing, so the card said "Not linked", and its menu offered "Link again", while every
    conversation worked. Linked is now the pairing the browser holds, or a bound session (`state/link.ts`).
    The time shown is when the pairing was made (`linkedAt` on the agent record, core 0.3.4), kept across
    the rotations of the secret; a pairing made before this shows "Linked via your phone" with no time
    until a session is bound.
29. **A linked browser stays level with the agent** (2026-11-12, Fabrice: "the latest message is not the
    same in all devices"; UI-SESS-016, PROF-SESS-015). The browser showed "Oups, désolé" as the last message
    of a conversation continued on the phone that morning. Its sessions had closed while idle, and the list
    is only read through a bound session: nothing refreshed it until the person wrote in a conversation, and
    a closed conversation that was selected showed the transcript the browser last held.
    - **Refresh.** At load, when the tab comes back in front and when a closed conversation is selected, a
      linked browser reads the agent's list; the conversation on screen, when its session closed, gets a
      session again, and with it what other devices added (the catch-up at stream attach). With no session
      bound it opens one silently (`Hub.refresh`); a browser that is not linked does nothing.
    - **Never the phone.** That opening asks for a bound session or none (`silent`, core 0.3.5): a pairing the
      agent ended is refused with no provisional session and no question on the phone, and the browser then
      reads as not linked. An agent that does not know `silent` and leaves a session waiting has it withdrawn.
    - **Its turn.** An opening reads the store when its turn comes, so a tab that waited for another tab's
      opening presents the secret that one left, not the one it started with.
    - **A session on a known conversation** keeps the conversation's preview and time as well as its title;
      it used to read as written in just now.
    - Idle sessions still close: nothing is reopened while the tab stays in the background.
30. **The unread count is the agent's** (2026-11-12, decided by Fabrice: a marker per conversation, the
    viewing entries kept for audit; UI-SESS-017, UI-CONV-010, PROF-CONV-008, D62). Each device counted unread
    by itself, so a conversation read on the phone stayed unread in the browser until it was opened there.
    - **The count.** For an agent that keeps the read state, a conversation's count is the one the agent
      lists and announces. The list gives it at every reading; `ayni.conversation.changed` gives it when it
      changes, and when the count is all that changed it is taken from the event with no reading of the list.
      The conversation in front of the person shows none. Against an agent without the read state the
      browser counts by itself as before.
    - **Reporting.** The browser already sent `viewed` receipts; they now also go out for an agent that
      declares the read state without receipts, and name the agent's attachments (by their entry) as well as
      its texts, so an image the agent made does not stay unread.
    - **Shared rules.** `unreadFrom`, `viewedIds`, `sendsViewed` and the reading of the event are in the core
      (0.3.6) for the app to apply the same ones.
31. **Reactions and replies on media messages** (2026-11-13, decided by Fabrice for the app: "Add them now";
    UI-CONV-024, PROF-RUN-009/010). A picture, a video, a file or a voice note could not be reacted to or
    replied to, and a reaction or a reply made to one elsewhere would not have shown here.
    - **One id.** The agent knows a media message by its entry, which each attachment carries. A reaction and
      a reply name that entry (`targetIdOf`), and the message's reactions are kept under it, from history as
      from a live event: history used to file them under the attachment's own id.
    - **In the transcript.** An attachment has the tools of a message, reduced to React and Reply. The
      reactions of a message that carries several attachments show once, on the last one.
    - **The quote.** A reply to a media message is quoted by what it is: its own words when it has some (a
      caption, a transcription), else "Photo", "Voice note", "Video", or the name of a file, in the four
      languages. The same in the composer's reply strip and in the details.
    - The rules are the core's (`mediaMessages.ts`, 0.3.7), for the app to apply the same ones.
32. **An upload carries the file's name in a field of its own** (2026-11-14, decided by Fabrice on my proposal:
    "go"; UI-MEDIA-003, PROF-HIST-008). A file sent from the phone showed here as `Terms%20of%20service.pdf`:
    React Native percent-encodes the name it writes on an uploaded file, and the agent kept it. The agent now
    takes the name from a text field `filename` sent before the file. A browser writes the name as it is, so
    nothing was wrong with what this UI sent; it sends the field as well, so that every client names a file
    the same way and the agent never has to read the part's own name (`ProfileClient.upload`, core 0.3.8).
    A file already stored under an encoded name still shows so here.
33. **Sending while the agent answers** (2026-11-14, Fabrice: "when I use for example, claude, I still can type
    and send information while it is thinking"; then "ok go" on: a queue on the agent, kept in its store, no
    withdraw, what waits answered together; UI-CONV-003 amended, UI-CONV-025, PROF-RUN-011/012/013,
    PROF-DESC-006). The composer stayed editable during a reply but Send was closed until it ended.
    - **Against an agent that takes it** (`features.queue`) Send works during a reply and shows beside Stop
      once there is something to send. Against any other agent, one run at a time, as before.
    - **The message is the agent's at once.** The agent records it and ends its run with no turn; the reply
      to what waited comes later on the session stream, in a run the agent starts, as a reply to a message
      sent from another device does. Reloading the page changes nothing: the message is recorded, and
      answered.
    - **What waits** is read from the agent's state (`state.ayni.waiting`), so it is the same on every
      device: the message this browser sent is marked "Waiting" where it stands, and one sent from another
      device shows here as waiting too, after the messages held. A waiting message has no tools yet.
    - **A run that gets no turn** says so in its first event; the core's client gives the transcript none of
      its events and returns how it ended (`ProfileClient.run`, `runEvents`), so the reducer and the run shown
      are untouched. Refused (too many wait), the message leaves the transcript and the person is told.
    - **Stop** ends the run shown, whoever started it: a run of this tab, or the one the agent started for
      what waited, which any device may stop. A run the agent no longer knows (left by a closed tab) is
      cleared here, as before. Stop names the run the person saw when they pressed it.
    - **A sending that failed.** A message sent during a run is marked (`queued`) until the agent says it
      recorded it; one whose sending ended without that leaves the transcript rather than stand as if it
      waited.
    - No withdraw (his decision): a message sent is sent.
    - The rules (`takesQueue`, `waitingOf`, `waitingViews`, `noTurnOf`) are the core's (0.3.9), for the app to
      apply the same ones.
34. **A voice note shows its length and its waveform** (2026-11-14, Fabrice: "how to show the duration? BTW I
    want to see the waveform of the voicenote in the bubble, too", then "go" on my proposal; UI-MEDIA-008,
    PROF-HIST-009). A voice note showed the browser's own audio control, and no length until it was read.
    - **The recorder measures the note** while it records it: its length, and the level of its sound ten
      times a second (an `AnalyserNode` on the microphone's stream). It sends both with the upload, in the
      fields `duration` and `waveform`; a browser that cannot measure sends the note without a waveform.
    - **The player** is the UI's own (`VoicePlayer` in `AttachmentView.tsx`): play and pause, the waveform as
      48 bars with the played part in the accent, the length before the note is played and the position
      while it plays. A click on the bars, or the arrow keys, moves in the note. A note with no waveform
      shows a plain line; one with no length shows it once the audio is read.
    - **The rules are the core's** (0.3.11, `voiceNote.ts`), for the app to share: `waveformFrom` (the
      levels sampled, as 48 whole numbers from 0 to 100, each the loudest of its part, the loudest of the
      note at 100), `voiceMeasureFields`, `waveformOf`, `waveformBars`, `playedBars`, `noteLength`.
    - **Mine, for him to confirm:** 48 levels; the waveform is scaled to the note's own loudest moment, so a
      quiet note does not look flat; the browser's audio control is gone, and with it its volume and speed
      menu.
35. **A voice note shows once** (2026-11-14, Fabrice: "Voice notes show twice after reopening a conversation
    … => fix it"; UI-MEDIA-007, PROF-MAP-006). The agent's history gave a voice note of the person as its
    attachment and as a text with the same transcription: read again, a conversation showed the player and a
    bubble with the same words. The agent now gives the attachment alone. The core (0.3.12) keeps to it
    whatever the agent sends and whatever a device kept: `withoutVoiceEchoes` drops a text of the person that
    stands under the id of a voice note's entry and only repeats its transcription, when history is merged
    and when an attachment arrives on a stream. So the notes already kept in a browser or on a phone are put
    right at the next reading of the conversation, and an agent of an earlier revision shows right too. Words
    the person added to a note are not its transcription, and stay.
36. **The context of a conversation under the message form; erased messages leave the transcript** (2026-11-18,
    Fabrice: the size of the context and its maximum just below the message form, in small characters; UI-CONV-026,
    UI-CONV-027, PROF-STREAM-007/008, agent D74, D78).
    - **The line.** Once the agent publishes the conversation's context figure (`state.ayni.context`: `used`,
      `cached`, `max`, `at`), a muted line of 11 px, centred under the composer, reads `Context 6.2k / 100k`, with
      ` · 4.1k cached` when part of it came from the provider's cache. Nothing shows before the first figure, from
      an agent that publishes none, or when one of its numbers is not a finite number; the line does not wait for
      `features.context`. The words are translated in the four languages; the numbers keep the `.` decimal in
      every language, because the figure is technical.
    - **The numbers.** Below a thousand as they are; from a thousand in thousands with at most one decimal; from
      a million in millions (`950`, `6.2k`, `1k`, `100k`, `1M` for 999 950, `1.2M`); never `2.0k`.
    - **Profile 3.2 not yet published.** The figure is read through a local type (`ContextFigure`); the
      dependency on `@ayni.org/ayni-agui-profile` stays at 3.1.
    - **The home indicator.** The composer and the line keep above the phone's home indicator: the composer's
      area is padded by the safe-area inset (zero on a desktop).
    - **Erased.** On `ayni.messages.erased` the reducer removes the messages it names, and their reactions: a
      message by its id, a media message by its entry, as a reaction names it (31 above). An event for another
      conversation than the session's is ignored. A message this browser sent is held under its own id until
      history names it under the agent's (`mergeHistory`); the event names it by that id too (`clientIds`, which
      the agent added to PROF-STREAM-008 for this), so it leaves the transcript even before history is read back.
    - The rules are the core's (0.3.13, `contextFigure.ts`: `contextFigureOf`, `formatTokens`, `contextLineOf`;
      `withoutErased`), with the English wording in `CONVERSATION_COPY`, for the app to apply the same ones.
37. **Spaces, memories, people, and deleting a message within a window** (2026-11-19, Fabrice's decisions of the
    spaces review, agent D80 to D93; AG-UI profile 3.3; UI-CONV-017 amended, UI-CONV-028 to UI-CONV-043). Built against
    ayni-spec #94 with the agent's answers mocked as the profile gives them; the agent of the same change was being
    built at the same time.
    - **Core 0.4.0.** The profile 3.3 types are local (`spaces.ts`, `memories.ts`, `people.ts`, `deletion.ts`) until
      the profile package of 3.3 is published; the dependency stays at 3.1. `ProfileClient` calls every endpoint of
      §3.6 to §3.9 and §8; `ProfileError` carries the `field` of a 422. The rules every screen follows are in the core
      for the Ayni app, with the English wording in `SPACES_COPY` (a test compares it with `en.json`). `CLIENT.version`
      is 3.3.0.
    - **Which agents.** An agent of profile 3.3 or later is asked for its spaces with its list of conversations, and
      once per page load whether its admin view answers this person (`GET /admin/roles`: Roles shows on a 200 only).
      A 404 on `/spaces` reads as Personal alone. Reads open no conversation on screen: with nothing bound, a paired
      browser gets a session quietly first.
    - **The card (UI-CONV-028).** With a space other than Personal, the rows (three by latest activity, then "N more
      spaces"), then a "Personal" label and the conversations of Personal; a conversation whose space this browser
      does not know stays with Personal, so nothing is ever out of sight. A row's unread count is the sum of the
      person's conversations of that space here (the agent's count before any is listed), so it moves with every
      reply and reading, as the agent's total does. A search shows the matching spaces and the matching
      conversations of every space, those outside Personal prefixed with their space; the archived view lists every
      space's. **New space is in the agent's menu** (and at the end of the chooser): the card itself must stay as it
      was for a person with Personal alone, who may still be a creator. Mine, for him to confirm.
    - **The chips (UI-CONV-029, UI-CONV-030).** Personal is written "Personal" by the UI, whatever the agent calls it.
      The retention reads in days, as the spec writes it ("kept 365 days"); a space with no limit (`null`) reads "kept
      with no time limit". A press on a space in the chooser applies at once (the board's confirm button is not
      built). New space from the chooser creates the space, moves the empty conversation into it, and opens its page.
      The header chip is grey (the muted colour), never teal or amber.
    - **The space's page (UI-CONV-031, UI-CONV-038 to UI-CONV-041, UI-CONV-043).** "Shared with the space" leaves out
      the person's own shared conversations, which are under Yours, marked "Shared with <space>". The members'
      states: the profile gives `active`, `invited`, `left` and the role `guest` for a person of another
      organization, so an invitation not bound yet is "Invited" for a guest and "Not yet on <agent>" for a person
      picked from the employee list. **The template's bounds are not in §3.7:** the UI reads them from the template
      when the agent gives them (`rules` with `min`/`max`/`allowed`, the shape the agent branch writes) and offers
      only those values; otherwise it offers the current values and the usual ones, and shows the agent's `422
      out-of-bounds` naming the field. The spec should give the bounds (flagged). The languages offered are the
      agent's, the UI's and the current one. The transfer goes to an active member of a list space, or to a person of
      the employee list for a rule space; the owner's segments then leave and the page shows About.
    - **Memories (UI-CONV-032 to UI-CONV-035).** One sheet for a memory or a preference, opened from the space's
      page, the keeps page, a reply's Info and the transcript line; after a deletion every list reads again. A
      reply's Info reads history back (up to ten pages of fifty) when the reply came live and does not say what it
      used; when history says nothing either, nothing is claimed. The "updated a memory" line is placed after the
      last message of the agent of its turn, never past the person's next message, live and from history alike.
      "What <agent> keeps about you" opens from the agent's menu, the conversation's menu (its row) and the trust
      card; its memories by space open in place.
    - **Deleting (UI-CONV-017, UI-CONV-036).** Delete is offered on the person's text and media messages that the
      agent recorded, younger than `features.erasure.windowSeconds` counted from the message's time, while online and
      while the conversation's session is live; a boolean `erasure` (3.2) offers nothing. A timer takes the item out
      of an open menu at the end of the window. The message and the reply leave at once: the agent's texts, media,
      placeholders and memory lines up to the person's next message; cards stay. They come back in their places,
      with the reason, on a refusal or when the agent cannot be reached. A media message is named by its entry.
    - **Away (UI-CONV-037).** Against an agent that keeps history, a read of history lets go of every text, media or
      memory line of the period the page covers (from its oldest message, from the start for the first page; to its
      newest, or to the end for the newest page) that it no longer returns. A message held here takes the agent's
      time when history names it, so the period is compared in the agent's times; what arrived after the read was
      sent, what this browser is still sending (a run in flight, or sent in the last minute), messages still on
      their way and cards stay.
    - **Refusals.** `409 space-left` drops the message, reads the spaces again and replaces the form with the line.
      There was no whole-conversation erasure in the web UI to remove.
    - **Checked against the agent branch (2026-11-19).** The core's client, parsers and reducer were run over HTTP
      against the agent's `feat/spaces-memories-people` (stub model, a directory of fictional people): every
      endpoint and event of §3.6 to §3.9 and §8 that the branch serves read as the core expects. The agent answers
      `space-left`, so `left-space` is no longer read; it gives the template bounds as the spec now writes them
      (`rules` with `default`, `min`/`max`, `allowed`, PROF-SPACE-001), so the bounds are no longer a gap.
38. **A message the AI never received; the memory line as a chip** (2026-11-19, Fabrice chose design A of three
    mockups; UI-CONV-044, UI-CONV-035 amended, PROF-STREAM-011, PROF-HIST-013, D95). Built against ayni-spec #97 while
    the agent side was being built at the same time.
    - **The bubble.** A message of the person that the service's code took (the address and the code of an email
      check) is the person's bubble in its shape, with no fill, so the transcript's ground shows through, a 1.5 px
      edge in the accent and the text in the text colour. Its meta line, in the accent, reads a lock, then
      `Not shared with the AI · 10:42`; the words are text, so screen readers read them, and the lock is hidden from
      them. Its Info says "Only the service's code read this. It was not shared with the AI." A reply quote and the
      search marks in it are drawn as on the agent's bubble, since the person's own colours need the fill. A
      conversation shared with a space shows its author's such message the same way. What the service's code wrote
      stays an ordinary bubble of the agent.
    - **How the browser knows.** Live, `ayni.messages.withheld` names the messages as an erasure does: by the
      agent's ids and by the ids the clients gave what they sent (`clientIds`); a bubble already drawn turns into
      the outline. From history, `metadata.modelVisible: false`, which a message already held takes too. An event of
      another conversation is ignored, a replayed message stays marked, and only the person's text messages are
      marked.
    - **The memory chip.** "<agent> updated a memory" is a centred chip: a pill with a 1 px edge, a bookmark, the
      words in the muted colour and a chevron; the whole chip opens the memory's sheet. Its edge is the muted colour
      at 45 % over a transparent ground: the border colour hardly shows on the dark ground (1.28:1) and faintly on
      white (1.24:1); the edge reads at 2.42:1 and 1.83:1, and the words at 7.37:1 and 4.83:1.
    - The values, roles and English words are the core's (0.4.1: `CONVERSATION_DESIGN.withheld` and `.memoryChip`,
      `CONVERSATION_COLORS.withheldBubble` and `.memoryChip`, `CONVERSATION_COPY.withheld` and `.withheldInfo`,
      `MESSAGES_WITHHELD`, `withWithheld`, `isWithheld`), for the app to draw the same.
39. **Tools, phase 1** (2026-11-20; ayni-spec #99: agent D96 to D100, AG-UI profile 3.4; UI-CONV-031 amended,
    UI-SESS-018, UI-CONV-045 to UI-CONV-052, UI-APPR-006). Built against the spec while the agent and the app were
    built at the same time, with scripted fakes of the agent; then aligned with the spec's answers to the questions of
    the three implementations (its commits of 2026-11-20 that add UI-CONV-052).
    - **Words.** Every outcome, refusal, the time left (`4:32 left`, read again every second, never below `0:00`), the
      needs-setup line, the members' heading and the lines of an approval are the table of UI-CONV-052, word for word,
      in `TOOLS_COPY`; a refusal that names a `field` is shown at it, any other under the control that sent the
      request.
    - **Against which agent.** Everything of tools is shown and asked only of an agent that declares `features.tools`
      (PROF-DESC-009): the Tools segment, the tools in About, the sources read before sharing, the sources read back
      from history. Every session this browser creates says `client.profileVersion: "3.4"`, to every agent, so that the
      agent asks it the confirmations of tool calls.
    - **The confirmation card.** The transcript's card (`.card`), on the agent's side, in its place in the reply: the
      source in small muted words, the action's title in bold, the account line, then every field, label above value,
      whole, with its line breaks (`white-space: pre-wrap`), indented JSON in a monospaced face, pinned fields first
      with a lock (and "Set by <agent>" for screen readers). The amber notice comes before the fields: the warning
      colour at 12 % over the card, a 1 px edge and an icon in it, the words in the text colour, since amber text does
      not reach 4.5:1 on the dark ground. Allow is the primary button; Allow for this conversation and Refuse are plain
      buttons (no red: the danger colour does not read on the dark card). The answer is an `approval.decide` run sent
      at once, beside the turn that waits (it neither waits for it nor blocks it), from whichever tab leads the session;
      the card takes the status the decision run answers, and every later `ayni.approval.update`. A card already decided
      never goes back to waiting. While a pending card is the transcript's last item no working indicator shows, and
      Stop stays, as it does during any run.
    - **Stop allowing** calls `DELETE /conversations/{id}/allowances/{approvalId}` and marks the card at once; another
      device's `allowanceEnded` reaches it through the update.
    - **The approval of a tool call** keeps the approval card's status, note, Approve, Reject, and shows the action as
      the confirmation card does. Its head is "<requester> asks for your approval" (`requester.displayName`) to the
      approver, and to the requester "Waiting for <owner>'s approval" for a tool of a space, the owner's name read from
      the person's list of spaces, else "Waiting for approval", with Cancel. Then the action's title and the space's,
      each on a line of its own, for both; no title's case is changed, and the title is not repeated below.
    - **The owner's Tools segment.** Between Members and Settings. A row per source with its state ("Needs setup:
      Workspace, account"); Add on a source not added or off opens its panel. The panel's parts, in the spec's order;
      Account shows for a space's account only once the source is added. Two Saves: the Save of the settings, at the
      end of What each tool asks, sends the bindings and the rules changed in one request (for a source not added it is
      "Add to <space>"), and the Save of the account sends the token. A rule is chosen, not sent, until the settings are
      saved. A step-up is said after its tool's title, never after the rule. While a change waits, the code, the time
      left and Withdraw take the place of the Save that sent it (at the top of the panel for one found waiting when it
      opens), the fields keep what the owner is confirming, and only what narrows stays open: the bindings, the token
      and the rules looser than the one in force are disabled (the agent would answer `409 change-pending`), while a
      stricter rule, Remove account and Remove from <space> apply at once and the change goes on waiting. A change ends
      on the `ayni.space.tools.changed` that names it and was heard after it started waiting; the list is then read
      again; Withdraw, or the agent dropping it, reads "Withdrawn. Nothing changed." Removing the account and removing
      the tool ask in the page, never in a browser dialog. Remove is red: the danger colour mixed 60 % with the text
      colour, which reads on both grounds (9.47:1 light, 5.48:1 dark).
    - **The stream while a change waits.** `ayni.space.tools.changed` reaches only sessions whose stream is open
      (PROF-TOOL-006), so while the segment shows a change that waits, `holdStream` makes sure a session of the agent is
      streamed, here or in another tab: the latest bound one, ahead of the stream budget, and one opened quietly on a
      paired browser with none bound; checked again every five seconds until the change ends.
    - **About.** The tools grouped by rule, each title followed by its step-up; the owner reads "Needs your
      approval", never their own name.
    - **The token.** An uncontrolled `type="password"` field with autocomplete, autocorrect, spell checking and the
      common password managers turned off; its value is read once when Save is pressed and the field is emptied right
      then, before the request leaves, even when the token is refused locally. It is never in React state, the store,
      a draft, a notice or a log; a test checks the page, the snapshot and the store for it.
    - **Sources.** A reply's Info lists them ("Relaticle CRM, the space's account · Web search, <agent>'s account");
      for a reply received live they are read back from history, one read shared with the memories' read. A reply
      read from history with no `sources` used no tool and shows none. In a conversation shared with the space each
      reply gets an Info button that opens the same list in a dialog. Before Share with <space>, the sources are read;
      none shares at once, some open "Share with <space>?", and a failed read shares nothing and says so.
    - **Several tabs.** The tab that hears `ayni.space.tools.changed` tells the others over the tab bus.
    - The values, roles and English words are the core's (0.5.0: `CONVERSATION_DESIGN.toolCard` and
      `.untrustedNotice`, `CONVERSATION_COLORS.toolCard` and `.untrustedNotice`, `TOOLS_COPY`), for the app to draw
      the same.
40. **One field per key of a space account** (2026-11-20, Fabrice, after setting up X for a space on devnet, whose
    account needs four keys typed in one field joined by colons: "it is not UX friendly. There should be one field per
    key/attribute."). The contract, written by the agent and the spec at the same time (ayni-agent and ayni-spec
    branches `feat/space-account-fields` and `spec/space-account-fields`):
    - **What the agent declares.** The owner's view of a source gives `account: { kind: "space", fields: [{ name,
      label, pattern? }], set, setAt, setBy }`: one field per value, in the order to show, every one a secret. This
      replaces the account's single `label` and `pattern`, which are no longer read: no fallback for an agent that
      still sends them (its account shows no field). A member's view is unchanged (`kind` only, read as no field).
    - **Setting it.** `PUT {sessions}/spaces/{id}/tools/{source}/account` with `{ values: { <name>: <value> } }`, every
      declared field together; the answer is as before (`202` with `pending`, the outcome on
      `ayni.space.tools.changed`). `422 bad-token` with `field: "account.<name>"` is shown at that field in the words of
      UI-CONV-052 ("<agent> does not take this <label>."). A `400` naming an `account.` field, or a `bad-token` naming a
      field the panel does not show, means the agent declares other fields than those on screen: the list is read
      again, the fields show empty as the agent now declares them, and the account says "This value is not in the
      form <agent> expects." (the table's words for a value refused, as no row of the table is about this).
    - **The fields.** One uncontrolled `type="password"` field per declared field, in the agent's order, its label
      above it and "Paste the <label>" in it, with autocomplete, autocorrect, spell checking and the common password
      managers turned off, as the token's field was. Save sends all of them in one request and is enabled only when
      every field holds something other than spaces; Enter in any field is Save. Only whether each field holds
      something is kept in React state, never a value.
    - **Checked before sending.** Each value is trimmed of the spaces and line breaks a paste brings at either end
      (Fabrice's keys were refused before this, most likely for a trailing space or line break), then refused when it
      is longer than 4096 characters, has a space or line break inside it, or does not match its field's `pattern`. A
      value refused this way is not sent: it stays in its field with the message, and so do the others; nothing goes
      until each fits.
    - **Emptied.** Every field is emptied as its request leaves, whatever the agent answers (a `422` asks to type them
      again), and goes with the panel when the owner goes back to All tools, to another segment or another page. No
      value is in the snapshot, the store, a draft, a notice or a log; the tests look for each in the page, the
      snapshot and the store.
    - **Once set.** The account reads "Set by <name> on <date>" with Replace and Remove account, and no field. Replace
      shows the fields again, empty, with Save and Cancel; Cancel hides them and what was typed goes with them. While
      the account's change waits, the code and the time left take the place of Replace (or of Save, for an account
      not set yet, its fields disabled). The status line no longer starts with the account's label: there is no
      single label any more, and each field has its own.
    - The core is 0.6.0: `SpaceToolAccountField`, `SpaceToolAccount.fields` (its `label` and `pattern` removed),
      `accountValueOf`, `accountValueFits` and `accountValuesOf` (they replace `tokenFits`),
      `ProfileClient.setSpaceToolAccount(token, spaceId, source, values)`, and `toolRefusalOf` answering
      `{ at: 'account', field, reason: 'badToken' | 'fieldsChanged' }` in place of `{ at: 'token' }`.
41. **Not done.** Browser-side calls, push notifications (by design), E2E encrypted cache (v4),
    automated accessibility audit in CI (axe) and a browser end-to-end test suite.
