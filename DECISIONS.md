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
40. **A link lists the person's conversations and spaces at once** (2026-11-20, found by Fabrice on devnet: "When I
    link the web (ui), the conversation list is not updated"; UI-SESS-019). He linked the browser again with his
    phone. The agent bound it as a device of the person his phone is, and the phone listed his five conversations and
    his two spaces; the browser showed one row, the session the link bound, titled "New conversation" with the time of
    the link and holding the history of "Obtain badge with email", and no spaces.
    - **Cause.** The list (and the spaces read with it), the sibling of a new session, the devices and every call of
      `withAgent` went through the first record of the agent that read `bound`, in the order the store keeps them
      (IndexedDB: by session id), never through the session the link had just bound. A record of an earlier binding
      came first: a session the agent closed while the browser was away, one it superseded, one of the guest the
      person was before. Its token was refused (or it listed another Principal's conversations), the failure was
      swallowed (`.catch(() => undefined)` at every call site, and `loadSpacesWith` kept quiet on anything but a 404),
      and the record stayed bound here, so every reading after it failed the same way. Only the refresh handled a 410,
      and threw on a 401.
    - **The latest binding.** The agent is asked through the bound session made last (`boundOf`); the list is read
      through the session named when there is one: the one a link just bound, the one whose stream just attached.
    - **A refused token is retired.** A 401, 404 or 410 to the list, to a session's status or to the opening of a
      sibling (401 or 410 to the other calls, where a 404 answers about what was asked for) closes the record here and
      forgets its token, which is never sent again; the next binding is asked. The conversation keeps its row,
      read-only until it is opened again.
    - **A link puts the earlier bindings right.** When the phone binds a provisional session, another Principal's
      records (a different name or backing identity than the new binding shows) leave with their transcripts, their
      tokens unused; every other bound session of the agent is asked its status, and one the agent refuses is retired.
      The list and the spaces are then read through the session the link bound, and read again after one and two
      seconds when that fails.
    - **Said, not swallowed.** A listing or a spaces reading that fails is logged (`console.warn`, the hub's one log
      line), never shown to the person.
41. **One field per key of a space account** (2026-11-20, Fabrice, after setting up X for a space on devnet, whose
    account needs four keys typed in one field joined by colons: "it is not UX friendly. There should be one field per
    key/attribute."). The contract, written by the agent and the spec at the same time (ayni-agent and ayni-spec
    branches `feat/space-account-fields` and `spec/space-account-fields`):
    - **What the agent declares.** The owner's view of a source gives `account: { kind: "space", fields: [{ name,
      label, pattern? }], set, setAt, setBy }`: one field per value, in the order to show, every one a secret. This
      replaces the account's single `label` and `pattern`, which are no longer read: no fallback for an agent that
      still sends them (its account shows no field). A member's view is unchanged (`kind` only, read as no field).
    - **Setting it.** `PUT {sessions}/spaces/{id}/tools/{source}/account` with `{ values: { <name>: <value> } }`, every
      declared field together; the answer is as before (`202` with `pending`, the outcome on
      `ayni.space.tools.changed`). The words are those of UI-CONV-052 as ayni-spec #103 settles them. `422 bad-token`
      with `field: "account.<name>"`, and the panel's own check of a field's pattern, are shown at that field with
      the label of that field: "<agent> does not take this <label>.", such as "Fleet support does not take this
      Access token.". A `400` naming an `account.` field means the fields changed since the panel was read: the list
      is read again, the fields show empty as the agent now declares them, and the account says, under its Save,
      "The fields of this account have changed. Open the tool again." (`tools.accountFieldsChanged`, in the four
      languages). A `bad-token` naming a field the panel does not show is taken as the same case and says the same.
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
      `TOOLS_COPY['tools.accountFieldsChanged']`,
      `accountValueOf`, `accountValueFits` and `accountValuesOf` (they replace `tokenFits`),
      `ProfileClient.setSpaceToolAccount(token, spaceId, source, values)`, and `toolRefusalOf` answering
      `{ at: 'account', field, reason: 'badToken' | 'fieldsChanged' }` in place of `{ at: 'token' }`.
42. **A new version says so, and Settings says which one runs** (2026-11-21, found by Fabrice on devnet: devnet went
    from 0.19.0 to 0.20.0, which fixes the conversation list and the spaces after a link, and his browser kept the old
    one: "I still do not see the spaces and conversations are not up to date"; then: "we should add on the ui
    somewhere in settings the current version being used, that way I can be sure I'm running the proper version";
    UI-PLAT-007, UI-PLAT-008).
    - **Cause.** The service worker is generated in `prompt` mode (`registerType: 'prompt'`, `injectRegister: null`),
      and `main.tsx` registered it with `registerSW({ immediate: true })` and no `onNeedRefresh`. A new worker
      installed and waited; nothing told the person and nothing sent it `SKIP_WAITING`, so every reload was served by
      the old worker from its precache until every tab of the app was closed.
    - **The banner.** When a version waits (`onNeedRefresh`), a strip across the top of the shell, above the rail, the
      list and the conversation, says "A new version of Ayni is available." with Reload (`update.available` and
      `update.reload` in the four languages, `UPDATE_COPY` in the core, 0.6.1). It stays until the page reloads. Its
      colours are those of `.banner.info` and `.btn.primary`: the words on the strip 15.44:1 in light, 14.33:1 in
      dark; Reload's label 5.47:1 and 7.77:1; the button and its focus ring against the strip 4.76:1 and 8.47:1. Dark
      by choice and dark by system take the same tokens; a test computes the figures from the stylesheet.
    - **Reload.** It writes what every message form holds first (`hub.flushDrafts`), then `updateSW(true)` sends the
      waiting worker `SKIP_WAITING`; when the new worker takes control, workbox-window's `controlling` reloads the
      page (`onNeedReload`), once. A page the old worker did not control (opened with a hard reload) sees no change of
      controller and reloads when the new worker is `activated`; when another tab already let it take over, Reload
      only reloads. If the drafts cannot be written, the page stays, with the banner. The other tabs of the app reload
      too when the new worker takes control, each after writing its own drafts.
    - **Drafts.** A draft was written 400 ms after the last keystroke (UI-SHELL-010), so a Reload right after typing
      would have lost its end. The message form now tells the hub what it holds at each change (`noteDraft`), and
      `flushDrafts` writes what is not written yet; opening another conversation flushes too. A test types, presses
      Reload at once, finds the text in the store when the update is sent, then in the message form of the next page.
      Attachments picked and a voice note recorded but not sent are not kept, as before.
    - **Checks.** The tab asks for a new version (`registration.update()`) each time it becomes visible again and every
      hour while it stays open; a check that fails (offline, the server down) leaves it to the next one.
    - **Still prompt.** `autoUpdate` would swap the version under someone in the middle of a sentence and reload every
      tab without asking; `prompt` leaves it to the person, with a check at most an hour old, or made the moment they
      come back to the tab. The registration stays explicit, so no push subscription ever exists (UI-PLAT-002).
    - **Settings.** Under About, "Version <release>" (the line was there) and now "Core <version>", read from
      `package.json` and `packages/core/package.json` by `vite.config.ts` at build time; before, the release came from
      `npm_package_version`, which only a build started by a package script sets. While a version waits, Settings
      shows the banner's words and the same Reload.
    - The first version with the banner reaches a browser the old way: once every tab of the app is closed.
43. **Every call to an agent goes with the cache mode `no-store`** (2026-11-21, found by Fabrice on devnet: in Chrome
    on his Mac, the browser linked to the Dev Agent never showed his spaces and showed one of his two conversations,
    for hours, after clearing cookies and site data and after linking again; a fresh Incognito window worked, then
    broke the same way; UI-SESS-020, profile PROF-ERR-003, ayni-agent decision 71).
    - **Cause.** The list is `GET {sessions}/conversations`, the same URL for every session; the token travels in
      `Authorization`, which is no part of the browser's cache key. The agent's answers carried no `Cache-Control`.
      Chromium holds a `410` with no freshness of its own as fresh for ever (as a `300`, `301` or `308`). Once the
      browser got one `410` "session closed" for the list (a session closed by a supersede), it answered every later
      list from its cache with that `410`, whatever the token, without asking the agent; only the CORS preflight went
      out. The hub reads the spaces only after the list succeeds (`syncConversationsNow` then `loadSpacesWith`), so
      they never showed, and each `410` retired one more session (UI-SESS-019). The devnet ingress logs show
      `OPTIONS /agui/v3/sessions/conversations` and no `GET` from 16:15 to 18:39 UTC, but one, at 18:37:38, answered
      `410`. The console then showed three `410` "session closed" for three
      sessions, two of which never reached the agent, the third freshly bound. The phone is not affected.
    - **The fix, here.** `ProfileClient` sends every call with `cache: 'no-store'`: it wraps the `fetch` it is given,
      so every method, present and future, goes through it, the session stream, the runs, the uploads and the
      attachments included, with the caller's own `init` kept. `discoverAgent` reads the descriptor with it too: the
      descriptor changes with the agent (`refreshDescriptor`). The calls to the indexer and the trust graph are not
      calls to an agent and keep the default mode. In `no-store` the browser neither reads its cache nor writes to
      it, so a `410` stored by an earlier version, or by a proxy, answers nothing any more; with the agent's
      `Cache-Control: no-store` (decision 71) nothing is stored in the first place. Both are needed: a browser that
      already holds the `410` keeps serving it to a default-mode request even after the agent sends `no-store`, until
      that entry is evicted.
    - **What it costs.** An attachment's `200` may carry `private, max-age=300`; the browser no longer uses it. The UI
      fetches an attachment once and shows it from an object URL, so nothing is fetched twice in practice.
    - **The app.** The core is shared: once the Ayni app takes core 0.6.2, React Native's `fetch` (whatwg-fetch)
      turns `cache: 'no-store'` on a `GET` into a `_=<time>` query parameter, which the agent ignores. Nothing else
      changes there.
    - **Headless Chrome (158), against a local API that answers `410` for one token and `200` otherwise.** With the
      agent's headers of today and the default mode, the first call gets the `410` and the calls with two other
      tokens get the same `410` from the cache, never reaching the API. With `Cache-Control: no-store` on the answer,
      or with `cache: 'no-store'` on the calls, or both, those two calls reach the API and get `200`. With the `410`
      already cached by a default-mode call, calls in `no-store` reach the API and get `200`; calls in the default
      mode keep getting the cached `410` even once the API sends `no-store`.
    - **Tests.** `packages/core/tests/noStore.test.ts`: every method of `ProfileClient` (found on its prototype, so a
      method added later is covered) makes its call with `cache: 'no-store'`; the caller's method, headers, body and
      signal are kept; the descriptor is read with it. Without the change all three fail (46 calls without it).
    - Core 0.6.2.
44. **Tools, phase 2: each person's own accounts** (2026-11-21; ayni-spec #107: agent D104 to D110, AG-UI profile
    3.5; UI-SHELL-014, UI-SESS-018, UI-CONV-044, UI-CONV-045, UI-CONV-047 to UI-CONV-050, UI-APPR-006 and UI-LINK-001
    amended, UI-CONV-053 to UI-CONV-058). Built against the spec while the agent and the app are built at the same
    time, with the fake agent of the tests; the wire is the spec's.
    - **Against which agent.** Your accounts, the Connect card and the owner's choice of a workspace are shown and
      asked only of an agent that declares `features.connections` (PROF-DESC-010). Every session says
      `client.profileVersion: "3.5"` (`CLIENT.version` 3.5.0), so that the agent shows Connect cards in it. The wire
      types and readers are in the core (`connections.ts`), the English words in `CONNECTIONS_COPY`, the table of
      UI-CONV-058 row by row; the app starts from both.
    - **Your accounts.** A page in the main pane (view `accounts`), from the agent's menu (once the browser is linked, as
      "What <agent> keeps about you"), the conversation's menu, Connect in About, a Connect card of an account of
      fields, and the return link. One row per item, in the agent's order: title, description, the binding as
      "<label>: <valueLabel>", where it is used (Personal first, then the spaces, joined by commas; `agent` anywhere is
      "Used in all your conversations"; none is "Not used now"), the state, the controls, and the words of an outcome
      under the row it names. A row is an `article` whose name is its title, its binding and its state (then the
      moreAccess line), so a screen reader reads those, then the controls. A connected account that the service asks
      more of shows both lines: "Connected as <label> · since <date>" and "<source> asks for more access. Reconnect to
      give it.". The date is the day and the short month in the UI's language, with the year when it is not this
      one: "Nov 21" in English (`en`, the language the UI uses); the spec's example writes the British "21 Nov". A row
      that holds no account offers no Disconnect. An agent that lists nothing reads "<agent> offers you no account of
      your own to connect." (words of this client: the table has no row for it).
    - **Read again.** On every `ayni.connections.changed` (heard once, from whichever session; other tabs are told by
      the tab bus), and each time the tab comes back in front for the agents a screen shows (`watchConnections`: the
      page and the cards hold it, so one read per agent, not one per card). The answer of a Disconnect or of the fields
      replaces its row at once, and the list is read again behind it. Only the latest read's answer is kept.
    - **The sign-in.** At the press a new tab opens (`window.open('', '_blank')`), its `opener` is cut, then
      `authorize` is sent (with `spaceId` for a row that serves only spaces: the first it serves; a row of Personal or
      of every conversation sends none), and the tab is pointed at `authorizationUrl` with `location.replace`, so the
      blank page leaves no history entry. A refusal closes the tab and is said under the row. The page never frames,
      reads or fills the sign-in, and sends nothing of its own into it; the browser's default referrer policy sends
      at most the UI's origin. Only an `https:` address (or `http:` on this computer) is opened: anything else, a
      `javascript:` one above all, would run in a tab of the UI's origin, so the tab is closed, the attempt cancelled
      and "Not connected: <source> did not complete the sign-in. Try again." is said. A browser that opens no tab
      sends nothing and reads "The browser did not open a new tab. Allow pop-ups for this page and try again." (words
      of this client). While an attempt waits, this tab's or one the agent lists (started on the phone or in another
      tab), the row shows "Finish in the browser · <m>:<ss> left", counted every second from the moment it waits, with
      Cancel, and a stream of the person stays open (`holdStream`) for its outcome. The outcome is the one the agent
      announces for that attempt, or for that account: matched by `attemptId`, else by source and binding value.
    - **The return link.** `/app/service/{did}/accounts` opens Your accounts of that agent and reads nothing else from
      the link: the state is the agent's list, the outcome its event (PROF-LINK-004). For an agent that does not declare
      `features.connections`, or that this browser does not know, the link is `/app/service/{did}` as before. A
      transcript link to it opens the page in place, named "Your accounts" on hover.
    - **An account of fields.** Connect opens the fields in the row, masked, never prefilled, with Save (enabled once
      every field holds a value) and Cancel; values are trimmed and checked as a space's account is, sent with
      `PUT …/account`, the fields emptied as the request leaves and when the page is left, and kept in no state, store
      or log. A refusal naming a field is said at it in the words of UI-CONV-052. Opened at the row of an account of
      fields to connect (from a Connect card or About), the fields are open at once.
    - **Refusals and outcomes.** In the words of UI-CONV-058. `400 bad-request` (a `spaceId` missing, a field the agent
      no longer declares) reads as `409 not-oauth`: "This account has changed. Open Your accounts again.". An outcome
      `disconnected` heard from another device reads as after one's own Disconnect; `ended` says nothing more than the
      row's new state.
    - **The Connect card.** The transcript's card, on the agent's side, at its place: the source's title in bold, its
      description and binding muted (`CONVERSATION_DESIGN.connectCard`, `CONVERSATION_COLORS.connectCard`), then the
      state of the account it names, found in Your accounts by source and binding value (else the row of its source that
      serves its space, else the first of its source). Until the list is read it claims no state, so a card in history
      does not flash "Connect your…" before "Connected as …"; if the list cannot be read, it follows the card's `why`.
      While its sign-in waits it shows the same waiting line and Cancel, and the outcome under it. A conversation shared
      with the space shows none (its history holds none, and the read-only view draws no such card).
    - **The account of a call.** On the person's own card, "With your account <label>" when the agent gives the label,
      else "With your own account"; on an approver's card "With <requester>'s own account". In a reply's Info,
      "<source>, your own account", and in a conversation shared with the space "<source>, <author>'s own account";
      before sharing, "<source>, with your own account · <n> results".
    - **A space's tool of each person's account.** In About: "Each person uses their own account", then "Your account:
      connected", or "Your account: not connected" with Connect, which opens Your accounts at that row; read again
      when the person's accounts change. In the owner's panel the Account section reads "Each person connects their own
      account, in Your accounts." and has no field. The binding a personal account is for (`fromAccount`) is chosen:
      the value in force as "<label>: <valueLabel>", then one radio "Use <valueLabel>" per choice, saved by the Save of
      the settings and confirmed on the phone as any binding; with no choice, "Connect your account to choose" starts
      the sign-in for the space with no value expected, and once connected the list is read again and offers it.
      `422 not-your-account` is said at the binding. A tool that uses another source's account (`account.from`, such as
      `github-project` using `github`) names that source in `account.source` (ayni-spec #110): Connect in About opens
      the row of `account.source ?? source`, and the owner's "Connect your account to choose" signs in to it.
    - **A credential pasted in a conversation.** `ayni.messages.withheld` with `reason: "credential"` marks the message
      (`withheld: "credential"`) and puts the text the agent kept in place of the one this device holds, in the
      transcript, the store, the row's title and preview (made from the text sent), and a text that waited for the
      session to bind. `texts` is keyed by the agent's ids; the device that sent the message holds it under its own
      id. `clientIds` has the length and the order of `messageIds`, with `""` for a message no client sent
      (ayni-spec #110), so a client's id takes the text of the agent's id at its place; `""` names nothing, in this
      event as in `ayni.messages.erased` (a message deleted with its reply: `['u-door', '']`). History's
      `metadata.withheld` does the same for a message held here. It is drawn as the
      email code is, and its Info says "This looked like a password or a key. <agent> did not keep it and did not show
      it to the AI. To connect an account, open Your accounts."
    - **Colours.** Every pair the new rules paint, computed from the tokens of both palettes (light; dark by choice and
      by system, which take the same tokens), WCAG 2.2: text at least 4.5:1, icons and edges at least 3:1. The
      reconnect icon is the warning colour (3.53:1 on the dark card, 3.73:1 on the dark ground); its words stay in the
      text colour. Disconnect is red as Remove is; Connect and Reconnect are the primary button.
    - **Tests.** `packages/core/tests/connections35.test.ts`, `tests/accounts.test.tsx`,
      `tests/personalAccounts.test.tsx`, and the version of the sessions (3.5) in the tests of 3.4.
    - Core 0.7.0.
45. **Show a new code on the link screen** (2026-11-21, found by Fabrice on devnet and chosen by him; UI-BIND-013).
    Since agent 0.28.1 (ayni-agent #104) the binding invitation is a single-use invitation record of the VS Agent, and
    the phone refuses an Out-of-Band invitation it received already ("This code was already scanned. Show a new code in
    the browser and scan it.", app APP-SCAN-013). After a scan that did not complete (cancelled on the phone, another
    code tapped, the sheet lost, the session's window ended) the browser kept showing the code the phone refuses, and
    only a reload gave another one.
    - **What the wire allows.** `POST {sessions}/{id}/binding` gives fresh material only once the current material
      expired, else `409` with it (PROF-BIND-007); before expiry a new code is a new session. `DELETE {sessions}/{id}`
      takes the token of a provisional session and closes it with reason `user` (PROF-SESS-003, PROF-SESS-005). The
      agent closes a provisional session three binding windows after it was created (`expired`, said on its stream;
      later calls `410`). It tells the browser nothing of a link refused or cancelled on the phone: the flow closes
      `cancelled` ("Not linked.") on DIDComm, the session stays provisional and its status does not change
      (PROF-BIND-004, agent `onLinkSessionStateChanged`). So the screen cannot say that it happened; it says, under the
      code, what to do when it did: "If you cancelled on the phone, picked another code, or the phone says this code
      was already scanned, show a new code and scan it." (the unused `bind.refused`, reworded).
    - **Show a new code.** A button under the code, in every state of the screen (`hub.newBindingCode`). Before the
      material expires it opens a new provisional session the way the first one was opened (the same conversation to
      resume, or a new conversation in the same space: `SessionRecord.newConversation`, core 0.7.1; the device handle
      when the browser holds one, so a known phone is asked again), and only then ends the old one on the agent with
      its own token: if the new one cannot be opened, the old code stays. The new session takes the old one's place:
      its transcript, its title, its row, and the screen, in the same change, so there is never a moment with neither.
      Pressed again while it runs, it is the same renewal. In another tab, the opening lock and a fresh read of the
      store leave a link that tab replaced already alone.
    - **By itself.** While the page is visible, and again each time it comes back in front: material that expired is
      refreshed on the same session (no new session, the phone is not asked again); a session that closed `expired`
      while its link was on screen gets a new session (the screen stays the link screen, where it showed an empty
      conversation and its message form before). A refresh that answers `410` (the session's window ended) or the
      same code (the agent's clock still holds it) gets a new session too. A link closed for any other reason waits
      for the button: nothing is opened in a loop. In the background nothing is asked; the dead code is not shown, and
      the button waits.
    - **Looks.** While the code waits, an outline in the accent over the page (`.btn.new-code`), with the lucide
      refresh icon; once the code is dead, the primary button. Light, and dark by choice and by system (the same
      tokens): the button's label, edge and focus ring 5.47:1 and 10.06:1; the primary's label 5.47:1 and 7.77:1;
      the line under the code 4.83:1 and 7.37:1; the code 17.74:1 and 17.01:1. A test computes them from the
      stylesheet.
    - **Focus.** The button is one element in every state and is never disabled while it works (`aria-disabled`), so
      focus stays on it while the code changes; a status line tells a screen reader "New code: K7-2P".
    - **Words.** `bind.newCode` "Show a new code" (it was "New code", shown only after expiry), `bind.renewing`,
      `bind.newCodeShown`, `bind.ended`, `bind.refused`, in the four languages.
    - **Tests.** `tests/linkNewCode.test.tsx`: the button ends the waiting session with its own token and shows a new
      session's code, the same button keeping focus, twice; a new conversation in a space opens its replacement the
      same way; an expired code is refreshed on the same session once the page is visible, and not while hidden; a
      session that closes `expired` on screen is replaced by a new session, with no message form; a refresh answered
      `410` gets a new session; after each, the agent holds one provisional session, the one on screen; the words in
      the four languages; the colours. All seven fail without the change.
    - Core 0.7.1.
46. **Approvals reach each person once: the Notifications** (2026-11-21, found by Fabrice on devnet and decided by him;
    ayni-spec #116: agent D114, the AG-UI profile 3.5 amended in place; UI-APPR-001, 002, 005, 006, UI-CONV-052 and
    UI-LINK-001 amended, UI-APPR-007 to 009). One post on X showed as four requests on the owner's phone: the agent had
    written the approval's card into each of his bound sessions, every conversation being its own session. Built against
    the spec while the agent and the app are built at the same time, with the fake agent of the tests; the wire is the
    spec's.
    - **Against which agent.** The Notifications, their badges and the agent's entry are shown, and their lists asked,
      only of an agent that declares `features.notifications` (PROF-DESC-011). The wire types, readers and rules are in
      the core (`notifications.ts`), the English words in `NOTIFICATIONS_COPY`; the app starts from both. Core 0.8.0.
    - **The approver.** A conversation never draws an approver's request (`drawsApprovalCard`: an approval whose
      `canDecide` is true and `own` is not), not even one an earlier agent wrote; `ayni.approval.request` does nothing;
      the conversation's menu button is "Menu", with no badge of approvals (the agent's menu carries no Approvals item).
      The rail's mark of approvals stays, read from bound sessions only: never from the state a closed session was left
      with (UI-APPR-009).
    - **Where they are.** A space's page has the segment Notifications right after Conversations, for every member
      (`spaceSegmentsOf(space, { notifications })`). Personal has none: what Personal's tools ask is in the agent's
      Notifications (profile §3.12), so its tab would always be empty. The agent's Notifications are a page of the main
      pane (view `notifications`), from the agent's menu once the browser is linked, as Your accounts is.
    - **An item.** The transcript's card, the width of the list: "<requester> asks for your approval" (or "Sent by you"),
      the request's time, the action's title and the space's on lines of their own, the exact action as the card shows it
      ("With <requester>'s own account" for a personal account), an elevation's tool, purpose and justification, then its
      status and its controls. The status is the time left ("4:32 left") while the person may decide it, "Approved by
      you · Waiting for other approvers" after their own decision, "Approved by <name> · <date and time>" or "Rejected by
      ..." once decided ("you" when the decider's name is the one the person's session shows), "Not answered in time",
      "Withdrawn"; a request the person sent reads the requester's line ("Waiting for <owner>'s approval"). An `article`
      named by its heading, the action's title and its status, its controls after.
    - **Deciding.** Approve and Reject, with the optional note, for an approval that needs no attestation: an
      `approval.decide` run through the latest bound session of the person, whose events reach no transcript (no turn,
      nothing added to any conversation); its refusals `decide-on-phone` (the item turns to Decide on your phone at once)
      and `not-eligible` are said under it, and the list is read again. An approval to attest (`attested: true`) shows
      Decide on your phone in their place, which sends `POST {sessions}/approvals/{id}/resend` and then says "Sent to your
      phone", or "<agent> cannot reach the Ayni app on your phone." for `409 confirmation-unavailable`; `approval.decide`
      is never sent for it.
    - **Kept current.** Each list is read when it opens, on every `ayni.space.notifications.changed` (heard on this
      tab's streams, or by another tab, which tells the others), after a decision, and each time the tab comes back in
      front; a stream of the agent is held open while a list is on screen, so that a decision on the phone shows. A read
      asked while one is in flight is made once more after it: every open stream of the person hears the event, and the
      requester's item changes status with the same `waiting` and `count`, so the events are not told apart. A list read
      again asks for as many items as are on screen (50 to 200). The badges are the agent's numbers as they come: a
      space's `notificationsWaiting` from `GET /spaces`, the event's `count` and each list's `waiting`; the agent's entry
      is read with the spaces (`GET /notifications?limit=1`). Heard on three streams, one approval still counts 1.
    - **Paging and links.** Newest first, more read as the end of the list comes into view, and with Show more from the
      keyboard. A link (`/app/service/{did}/spaces/{spaceId}/notifications?approval=`, or
      `/app/service/{did}/notifications?approval=`) opens the list with that item selected (an accent edge,
      `aria-current`, focused), reading on up to ten pages to find it; it decides nothing.
    - **The requester.** One card, where she asked: "Waiting for <owner>'s approval" (or "Waiting for approval"), then the
      outcome in that same line, with its icon ("Approved by Jonas Weber", "Rejected by ...", "Not answered in time",
      "Withdrawn"), from `ayni.approval.update` and the activity replaced under its message id. Cancel (and Withdraw on an
      elevation's card) sends `approval.cancel` as a decision run: no turn, and the card turns to Withdrawn where it is.
      The Approval/Pending row of the tool card is gone; the approver's controls on any card too.
    - **Words.** Approve and Reject stay the card's words. New: `notifications.*`, `spaces.segments.notifications`,
      `approval.approvedBy` and the other status words of UI-CONV-052, `conversation.menu` (in place of
      `conversation.approvals`), `link.destination.serviceNotifications` and `spaceNotifications`, in the four languages.
      This client's own, for cases the table does not name: Show more, "<n> waiting" (the badge for a screen reader),
      "This request has ended.", "You can no longer decide this request.", "Your answer was not sent. Try again."
    - **Colours.** Light, and dark by choice and by system (the same tokens), WCAG 2.2: the badge's number 5.47:1 and
      7.77:1, its edge on the page 5.47:1 and 10.06:1 and on a selected tab or row 4.63:1 and 8.12:1; an item's text
      16.98:1 and 16.12:1, its muted lines 4.63:1 and 6.99:1; the selected edge 5.47:1 and 10.06:1; Sent to your phone
      14.81:1 and 13.39:1; a refusal 13.87:1 and 15.37:1; Approve and Decide on your phone 5.47:1 and 7.77:1. A test
      computes them from the stylesheet.
    - **Tests.** `packages/core/tests/notifications.test.ts`, `tests/notifications.test.tsx` (an approver with three
      conversations sees no card in any and one item, the badge 1; the agent's entry; nothing without the feature;
      Approve with a note and no turn; Decide on your phone and its refusal; the refusal `decide-on-phone`; past items;
      the empty list and Show more; read again on the event, from another tab and on the tab's return; a link's item
      selected; the requester's card in place and Cancel; no waiting without a card; the words; the colours), and the
      tests of the approval card and of the account line amended to the approver's item.
47. **Each entry of a menu shows its icon, the same as in the app** (2026-11-23, found by Fabrice on devnet: "in the
    home, in the 3 dots menu of the agent card on the web ui, the icons are missing (they are present on the app)").
    The agent's menu on its card, and a conversation's menus, were words alone; the app draws each entry with its icon
    (APP-HOME-020, APP-CONV-008/040).
    - **One table.** `MENU_ICON` in the core (core 0.8.1): the icon of each entry by the app's key of the entry, as a
      lucide name, the app's entries the browser does not draw included, so the app can read the same table. An entry
      that means the same shows the same icon: Link again is the app's Reconnect (`plug`, the way back after
      Disconnect's `unplug`); What <agent> keeps and Your accounts have the same icons in the agent's menu and in a
      conversation's. The browser's own entries: New space `plus` (the icon of New space where a space is chosen),
      Roles `user-cog` (`shield-check` is the trust mark on the same card, `users` a team space). Unarchive is
      `archive-restore`, the drawing lucide 1.66 calls `archive-arrow-up`.
    - **Where.** The agent's menu (`Column`), a conversation's menu from its row (`ConversationRow`), and Request access
      in the conversation's header menu; the agent's own items there keep their words alone, as in the app. The tile's
      menu (Pin, Unpin) and a message's menu had their icons already.
    - **Looks.** `MenuEntry`: the icon (16 px, as the browser's other menus), the words, then a count (the
      Notifications' badge) at the end. The icon is drawn in the entry's colour (`currentColor`): the text's in the
      light and the dark theme, the danger red for Remove agent and Close for good. It is `aria-hidden`: the words
      name the entry. The size is not shared: the app's menu is a sheet with its own.
    - **Tests.** `tests/spacesColumn.test.tsx`: each entry of the agent's menu, linked, in the archived view and not
      linked, and of a conversation's, with its icon by its lucide name; every name of the table drawn; the layout in
      the stylesheet. `tests/spacesConversation.test.tsx`: Request access with its icon, the agent's item without.
      Each fails without the change.
48. **The owner's answers of 2026-11-23: words and display** (2026-11-23, Fabrice reviewing the clean spec, ayni-spec
    #123: C1, C6, C7, F11, F12, F13, D13; UI-CONV-016, 044, 045, 047, 048, 052, 058, 064, UI-APPR-008, UI-MEDIA-009,
    UI-SEC-006). Core 0.9.0.
    - **A source named by its feature.** One rule for every source, wherever one is named: the confirmation and
      approval cards and the items of the Notifications, a reply's Info, the dialog before sharing, a Connect card, the
      owner's Tools segment and About. "<feature> · <source>" ("Files · Nextcloud", "CRM · Relaticle", "Social posting ·
      X"), the title once when the feature's and the source's are the same ("Web search"), as Fabrice asked, and the
      title alone while the agent gives no `feature` (it does not yet: PROF-TOOL-035 is the agent's to build).
      `sourceNameOf` in the core.
    - **The addresses outside the organization.** A card whose action carries `outsideOrganization` reads "Outside your
      organization: <address>, <address>" after the account line, before the untrusted notice and the fields. The agent
      does not send it yet (agent TOOL-FEAT-013).
    - **The time left** is `m:ss` under one hour and "<h> h <mm> min" from one hour ("23 h 59 min left"), on the items of
      the Notifications and on a change of a space's tools.
    - **Three refusals.** `409 space-account-not-set` "This space's account isn't set up yet; ask its owner." and
      `409 provider-not-used` "This provider isn't used in this space.", under the control that sent the request (the
      agent sends neither yet; the list's search that would hear the first is not built); `409 not-pending` to Decide on
      your phone "This request was already decided or has ended.", the list then read again, the same words for a
      decision refused so.
    - **Your accounts named only where they exist.** The Info of a message held back for a credential ends with "To
      connect an account, open Your accounts." only for an agent that declares `features.connections`.
    - **An attachment held back.** An `ayni.attachment` that says `withheld: "credential"`, or that
      `ayni.messages.withheld` names for a credential with no text, carries under it "One attachment was held back: it
      contained a credential."; the words of its message are drawn as any other. Drawing the attachment itself apart
      (UI-MEDIA-009) stays to do, and the agent does not hold attachments back yet (agent TOOL-ACCESS-018).
    - **Reduced motion.** The thinking dots went on bouncing under reduced motion: the page-wide rule (`*`) does not
      outweigh the rule that sets their bounce. A rule for the dots under reduced motion, after it, stops them: the
      indicator stands still with its words "Thinking…". The page-wide rule is beaten the same way by the spinner of
      `.spin`, left as it is.
    - **Visitor.** No word of the browser called a person admitted without authenticating a guest; a comment of the hub
      and the relink tests now say visitor. "Guest" stays for a member of a space from another organization.
    - **Already as the spec says** (checked against bbc324c): the bare `https://` link, the credential card's line, "you
      own it", Stop allowing's and Share's failures, "Add to <space>", "All tools", the empty Tools, the rows of UI-CONV-058
      added as built, the app links of UI-LINK-001, the CSP of UI-SEC-001, the design from the core (UI-THEME-002).
    - **Tests.** `packages/core/tests/tools.test.ts` (names, the outside addresses, the time left, the refusals),
      `packages/core/tests/reducer.test.ts` (an attachment held back), `tests/confirmationCard.test.tsx`,
      `tests/toolSources.test.tsx`, `tests/spaceTools.test.tsx`, `tests/notifications.test.tsx`,
      `tests/personalAccounts.test.tsx`, `tests/conversationDesign.test.ts`. Each fails without the change.
49. **The danger red in the dark theme, and Disconnect in red** (2026-11-23, Fabrice reviewing the clean spec, ayni-spec
    #123). The red of what cannot be undone was one colour in both themes, `#b91c1c`: on the dark page and menus it read
    at 2.89:1, under the 4.5:1 that WCAG 2.2 AA asks of words.
    - **Two reds.** `--danger` is `--light-danger` (`#b91c1c`) or `--dark-danger` (`#f87171`, the Ayni app's `DARK.red`),
      set in both dark blocks, by choice and by system, as the other roles are. Remove agent, Close for good, a message's
      Delete and Disconnect read 6.47:1 on the light page and 6.77:1 on the dark one, 6.19:1 and 6.41:1 on an entry under
      the pointer or a card.
    - **What is written on the red** (the unread count of a tile, Stop, the stop of a recording) takes
      `--danger-contrast`: white in the light theme, the dark page's colour in the dark one, 6.47:1 and 6.77:1.
    - **Disconnect from this agent** is in red in the agent's menu, as the app draws it.
    - **Figures.** The dark figures of the tests of the Notifications and of Your accounts were computed with the light
      red; they now use the dark one: a refusal 13.73:1, Your accounts' Disconnect 8.82:1, an outcome refused 13.68:1.
    - **Tests.** `tests/dangerColour.test.tsx` (the entries in red, the tokens, the contrasts); the colour tests of
      `tests/conversationDesign.test.ts`, `tests/notifications.test.tsx` and `tests/personalAccounts.test.tsx` take the
      dark red. Each fails without the change.
50. **No test of the agent's version, no interrupts, no voice-note echo** (2026-11-23, Fabrice reviewing the clean spec,
    ayni-spec #123: A1, A2, B4, B10 a). Code the spec no longer states, removed. Core 0.10.0.
    - **The client's version.** Sessions no longer carry `client.profileVersion` (PROF-SESS-016 and UI-SESS-018 are
      gone): `clientDescription(browser)` is the web platform and the browser for every agent, and the description of
      a 3.0 agent, the browser as its platform, is gone with `PROFILE_VERSION`.
    - **The agent's version.** `hub.speaks33` is gone: the spaces and the admin view are asked of every agent (one that
      serves none answers `404`, as before), and What <agent> keeps about you is offered from the agent's menu, a
      conversation's menu and the trust card to a linked browser, and the memories a reply used are read, whatever minor
      version the descriptor declares. Its major version is still checked (UI-TRUST-001).
    - **Interrupts.** A run carries no `resume` (UI-CONV-008 is gone, B4): nothing filled it.
    - **The voice note's echo.** The text of the person that only repeated a voice note's transcription, which an agent
      of an earlier revision sent, is no longer dropped (`withoutVoiceEchoes`, UI-MEDIA-007 amended, A1).
    - **Already gone.** Create a service and the rail's Mine group (B10 a) have no code here: the add page offers Find a
      service only, and `/app/explore/create` says "on your phone", as AG-UI profile §10 lists it. No note of a
      hardening phase remains in the code or its documents.
    - **Tests.** `packages/core/tests/reducer34.test.ts` (the client's description), `packages/core/tests/queue.test.ts`
      (no `resume`), `packages/core/tests/mediaMessages.test.ts` (the person's text kept beside a note),
      `tests/confirmationCard.test.tsx` (no `client.profileVersion`), `tests/spacesColumn.test.tsx` (What <agent> keeps
      for an agent of 3.1). Each fails without the change.
51. **"This service lets visitors in." on the trust card** (2026-11-23, Fabrice reviewing the clean spec, ayni-spec
    #123: UI-TRUST-008, PROF-DESC-012). Core 0.11.0.
    - **The line.** For an agent whose descriptor declares `features.visitors`, the Proof of Trust card shows "This
      service lets visitors in." right under the verdict and its reasons. It comes from the descriptor, so it shows at
      once, without waiting for the registry. Any other agent, `visitors` absent, `false` or not a boolean, shows nothing
      of it. `letsVisitorsIn` and `PROOF_OF_TRUST_COPY.visitors` in the core, `.pot-visitors` in the stylesheet, in the
      text colour at 14px; the Ayni app shows the same line on the service's page (APP-SESS-023).
    - **My choices:** the place, under the verdict; the words in Spanish, French and Portuguese ("Este servicio admite
      visitantes.", "Ce service accepte les visiteurs.", "Este serviço aceita visitantes.").
    - **The agent** declares `features.visitors` from ayni-agent #118 on; before it, no agent does and no card shows the
      line.
    - **Tests.** `tests/visitorsLine.test.tsx` (the line under the verdict with `visitors: true`, nothing with nothing,
      `false` or `"yes"`), `packages/core/tests/proofOfTrustDesign.test.ts` (`letsVisitorsIn`, the English words),
      `tests/proofOfTrustDesign.test.ts` (the stylesheet against the design, the English file against the core's
      words). The render test fails without the change.
52. **Not done.** Browser-side calls, push notifications (by design), E2E encrypted cache (v4),
    automated accessibility audit in CI (axe) and a browser end-to-end test suite.
