# @ayni.org/ayni-ui-core

The framework-independent core of the Ayni UI (`2060-io/ayni-spec`, `v4/ayni-ui`, UI-SHELL-004): agents and
controllers, trust resolution through the Verana indexer, sessions and binding against the
[AG-UI profile](https://www.npmjs.com/package/@ayni.org/ayni-agui-profile), the conversation reducer, the local store
and sync. The browser UI in this repository and the Ayni app both build on it; nothing in it touches the DOM beyond
`fetch`, `EventSource` and IndexedDB (`idb`).

```sh
pnpm add @ayni.org/ayni-ui-core @ayni.org/ayni-agui-profile
```

## One design, two renderers

The browser draws with CSS and the Ayni app with React Native styles. What the two must share is written here once:

| Surface | Design values and colour roles | What it shows |
| --- | --- | --- |
| A conversation | `CONVERSATION_DESIGN`, `CONVERSATION_COLORS` | `replyQuoteOf`, `reactionPillOf`, `plainText`, `progressOf` (the agent is working), `contextFigureOf` and `contextLineOf` (the context line under the message form), `isWithheld` (a message of the person the AI never received, drawn as an outline: the reducer marks it from `ayni.messages.withheld` and from history's `metadata.modelVisible`), the memory line as a chip (`memoryChip`), the exact action of a tool call on its card and the amber notice of untrusted content (`toolCard`, `untrustedNotice`), and its English wording (`CONVERSATION_COPY`) |
| The home page (rail and column) | `HOME_DESIGN`, `HOME_COLORS` | `TRUST_MARK`, `CONTROLLER_KIND_ICON`, `formatTime` |
| The Proof of Trust | `PROOF_OF_TRUST_DESIGN`, `PROOF_OF_TRUST_COLORS` | `verdictOf`, `identityStepOf`, `accreditationLine`, `otherCredentialLine`, `claimRows`, and its English wording (`PROOF_OF_TRUST_COPY`) |

The browser's stylesheet is the reference: tests in this repository compare it, and the English translation file,
with these values, so a change made on one side only fails. The app builds its styles from the same values. A change
of look or wording on one of these surfaces starts here.

## One conversation, every device

A conversation shows the same transcript on every device of a person (AG-UI profile PROF-STREAM-005,
PROF-HIST-007). The agent sends a session what the person's other devices add; the reducer places a text message
by its role and its id, so a message typed elsewhere lands on the person's side. For what a client missed while it
was away:

| Function | What it does |
| --- | --- |
| `readCatchUp(transcript, read)` | Reads the newest pages of history, going back until one reaches what the transcript holds, history ends, or four pages were read; then merges them. |
| `catchUp(transcript, pages)` | The merge itself. The transcript keeps its own paging position; when more was missed than was read, it starts over from the pages, so it never shows a hole. |
| `reachesTranscript(transcript, page)` | Whether a page of history holds a message the transcript already has. |

A client calls `readCatchUp` every time a session's stream attaches. Given a `purge` (with what the client still
sends, to keep), the merge also lets go of every message of the period a page covers that the page no longer returns
(UI-CONV-037): a message deleted or erased while the client was away leaves its cache too.

## Profile 3.3: spaces, memories, people, deletion within a window

The wire types of AG-UI profile 3.3 are written here (`SpaceInfo`, `SpaceTemplate`, `SpaceMember`, `MemoryInfo`,
`PreferenceInfo`, `AboutMe`, `DirectoryPerson`, `OrganizationInfo`, `AdminRoleEntry`, `AdminChange`, `SpaceRef`) until
the profile package of 3.3 is the one every client has, with tolerant readers for each answer (`spacesOf`,
`spaceDetailOf`, `spaceActivityOf`, `sharedConversationsOf`, `memoriesOf`, `aboutMeOf`, `peopleOf`, `organizationsOf`,
`adminRolesOf`, `adminChangesOf`). `ProfileClient` calls every endpoint of §3.6 to §3.9 and the deletion of §8, and a
`ProfileError` carries the `field` a `422 out-of-bounds` names. The rules a screen follows:

| Surface | Functions |
| --- | --- |
| The rows of the agent's card (UI-CONV-028) | `hasOtherSpace`, `spaceRowsOf` (three, then "N more", or the titles a search matches), `spacesWithLocal` and `spaceUnreadOf` (the unread and latest activity of the person's conversations here), `isPersonalConversation`, `membersLineOf` |
| The chips of a conversation (UI-CONV-029, UI-CONV-030) | `showsSpaceChooser`, `chooserSpacesOf`, `showsHeaderChip`, `spaceRefOf` (`state.ayni.space`) |
| The space's page (UI-CONV-031, UI-CONV-040, UI-CONV-041, UI-CONV-043) | `spaceSegmentsOf`, `lawfulBasisKeyOf`, `memberStateOf`, `ruleChoicesOf`, `canWriteIn`, `memberRefusalOf`, `looksLikeEmail` |
| Memories (UI-CONV-032..035) | `memoryLineOf` (the reducer turns `ayni.memory.updated` into the `ayni.memory-update` line), `placeMemoryLines` (each line after its reply), `usageOf`, `usageSummaryOf`, `withUsageFrom` (what history says a reply used) |
| Deleting a message (UI-CONV-036) | `deletionWindowOf`, `canDeleteMessage`, `deletableUntil`, `deletionIdOf`, `turnToDelete` (the message and the reply to it; the cards stay), `withRestored`, `deletionRefusalOf` |

The English wording of these surfaces is `SPACES_COPY`, keyed by its path in the translation files.

## Profile 3.4: tools, phase 1

The wire types of AG-UI profile 3.4 (§3.10, §6, §8; agent D96 to D100) are written here (`SpaceTool`,
`SpaceToolsChange`, `ToolAction`, `ToolConfirmation`, `MessageSource`, `ConversationSource`), with tolerant readers
(`spaceToolsOf`, `spaceToolsChangeOf`, `toolActionOf`, `confirmationOf`, `toolApprovalOf`, `messageSourcesOf`,
`conversationSourcesOf`). `ProfileClient` calls the endpoints of §3.10 (a change answers `200`, applied, or `202`,
waiting for the owner's phone: `SpaceToolAnswer.status`), the sources of a conversation and the end of an allowance;
`clientDescription` sends `client.profileVersion: "3.4"` (PROF-SESS-016). The reducer applies `ayni.approval.update`
to the card it names, where it is (status, scope, end of an allowance), signals `ayni.space.tools.changed`, and reads
`metadata.sources` from history; a decision run ends with `noTurn: "decision"` and the status the agent holds.

| Surface | Functions |
| --- | --- |
| The owner's Tools segment (UI-CONV-050, UI-CONV-049) | `takesTools` (`features.tools`), `spaceSegmentsOf(space, { tools })`, `toolRowStateOf`, `missingOf`, `canAdd`, `isAdded`, `ruleChoicesFor` (no looser than the agent-pack's), `loosens`, `bindingValueFits`, `tokenFits`, `timeLeftOf`, `changeOutcomeKeyOf`, `toolRefusalOf` (at the field a `422` names, or the panel's) |
| The tools in About (UI-CONV-031, UI-CONV-049) | `readyToolsOf`, `ruleGroupsOf` (by rule, loosest first, each tool with its own step-up, `off` left out) |
| The confirmation card (UI-CONV-045, UI-CONV-046) | `isConfirmation`, `confirmationOf`, `confirmationOutcomeOf`, `canStopAllowing`, `looksLikeJson`, `fieldsInOrder`, `awaitsConfirmation` (no working indicator under a card that waits), `withApprovalUpdate`, `withDecided`, `withAllowanceEnded` |
| The approval of a tool call (UI-APPR-006) | `toolApprovalOf`, `requesterNameOf` |
| Sources (UI-CONV-047, UI-CONV-048) | `sourcesOf` (undefined for a reply received live, not read back yet), `withUsageFrom` (history's sources too) |

The English wording of tools is `TOOLS_COPY`, the words of UI-CONV-049 and the table of UI-CONV-052 among them,
keyed by its path in the translation files.

Published to npm from this repository by the `npm-publish` workflow whenever `package.json` carries a version that is
not on npm yet.
