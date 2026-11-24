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
| The menus of an agent and of a conversation | each client's own: a sheet in the app, a popover in the browser | `MENU_ICON`, the icon of each entry by its key (a lucide name) |

The browser's stylesheet is the reference: tests in this repository compare it, and the English translation file,
with these values, so a change made on one side only fails. The app builds its styles from the same values. A change
of look or wording on one of these surfaces starts here.

The English wording of the browser's banner for a new version waiting to take over (UI-PLAT-007) is `UPDATE_COPY`.

`ProfileClient` sends every call to the agent with the fetch cache mode `no-store`, and `discoverAgent` reads the
descriptor with it (UI-SESS-020): no answer a browser or a proxy stored ever answers a call. The `fetch` a client gives
`ProfileClient` receives the caller's `init` with `cache: 'no-store'` added.

A provisional session opened to start a new conversation says so in its record (`SessionRecord.newConversation`), so
that a client which replaces its code with a new session (UI-BIND-013) opens the new one the same way.

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

## Disconnect forgets the person

When the person disconnects from an agent (UI-AGENTS-006) or removes it (UI-AGENTS-005), a device forgets everything
it read from the agent for them, not only the conversations. `withAgentForgotten(held, agentDid, sessionIds)` gives the
state with none of it left: the agent's spaces and templates with their counts, its Notifications count, Your accounts,
whether it gave the person its admin view or spaces to steward, the changes of tools and of accounts it announced, its
pages that are open (a space, What it keeps, roles, stewardship, a shared conversation, a memory, Your accounts,
Notifications), and what is held of its conversations (transcripts, replies, prefills, searches, what is being sent).
`AGENT_PAGES` names the views that close. The sync message `agent-forgotten` has every other tab forget the same.

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
waiting for the owner's phone: `SpaceToolAnswer.status`), the sources of a conversation and the end of an allowance.
The reducer applies `ayni.approval.update`
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

## Profile 3.5: tools, phase 2, each person's own accounts

The wire types of AG-UI profile 3.5 (§3.11, §5, §6, PROF-TOOL-014 to 021; agent D104 to D110) are written here
(`Connection`, `ConnectionAttempt`, `ConnectionsChange`, `ConnectCard`), with tolerant readers (`connectionsOf`,
`connectionOf`, `connectionAttemptOf`, `connectionsChangeOf`, `connectCardOf`). `ProfileClient` calls the endpoints of
§3.11 (`connections`, `authorizeConnection`, `cancelConnectionAttempt`, `setConnectionAccount`, `disconnectAccount`), and
a `ProfileError` carries the `expected` and `chosen` of a `422 wrong-binding`. `personal` is a kind of account in the
shapes of 3.4: a space's tool says whether the reader's own account is `connected`, a binding a personal account is
for has its `valueLabel`, `fromAccount` and the owner's `choices`, and the action of a card carries the account's
`label` on its person's card only. The reducer signals
`ayni.connections.changed` and, for `ayni.messages.withheld` with `reason: "credential"`, puts the text the agent kept
in place of the one the device holds (`withheldTextsOf`, a message's `withheld: "credential"`), as history's
`metadata.withheld` does. `parseAppLink` reads `/app/service/{did}/accounts` (PROF-LINK-004).

| Surface | Functions |
| --- | --- |
| Your accounts (UI-CONV-053) | `takesConnections` (`features.connections`), `connectionKeyOf`, `connectionFor` (the row a card, a link or a space names), `usageOfConnection`, `connectionStateKeyOf`, `connectionControlsOf`, `sinceDateOf`, `attemptWaits` |
| The sign-in and the fields (UI-CONV-054, UI-CONV-055) | `spaceIdFor` (the space a row's sign-in is for), `signInUrlAllowed` (only the service's sign-in over HTTPS is opened), `accountValuesOf` (as for a space's account) |
| Outcomes, refusals, Disconnect (UI-CONV-056, UI-CONV-058) | `outcomeNoticeOf`, `connectionRefusalOf`, `disconnectedKeyOf` |
| The account of a call (UI-CONV-045, UI-APPR-006) | `accountLineOf` (whose card it is: the person's, or an approver's) |
| A space's tool of each person's account (UI-CONV-049, UI-CONV-050) | `accountSourceOf` (the row of Your accounts its Connect opens: `account.source`, for a tool that uses another source's account, else its own) |
| The Connect card (UI-CONV-057) | `CONNECT_ACTIVITY`, `connectCardOf`, `CONVERSATION_DESIGN.connectCard`, `CONVERSATION_COLORS.connectCard` |

The English wording of these surfaces is `CONNECTIONS_COPY`, the table of UI-CONV-058 row by row, keyed by its path in
the translation files.

## Profile 3.5 as amended on 2026-11-21: the Notifications (agent D114)

Approvals reach each person once. An approver finds an approval nowhere in their conversations: on their phone and in
the Notifications of the space (an approval of a space's tool) or of the agent (any other); the requester sees one card,
in the conversation where they asked, replaced in place by each status. The wire types of §3.12 are written here
(`NotificationItem`, `NotificationApproval`, `NotificationsPage`, `NotificationsChange`), with tolerant readers
(`notificationsPageOf`, `notificationOf`, `notificationApprovalOf`, `notificationsChangeOf`). `ProfileClient` reads the
lists (`notifications(token, spaceId | null, before?, limit?)`, 50 by default, 200 at most) and sends Decide on your
phone (`resendApproval`); a space carries `notificationsWaiting`; `parseAppLink` reads
`/app/service/{did}/spaces/{spaceId}/notifications?approval=` and `/app/service/{did}/notifications?approval=`
(PROF-LINK-005). The reducer signals `ayni.space.notifications.changed` and no longer reacts to the withdrawn
`ayni.approval.request`. A decision from the Notifications is `approval.decide` and a withdrawal `approval.cancel`, both
ending with `noTurn: "decision"`; a refusal is a `RunError` whose code is `decide-on-phone` or `not-eligible`.

| Surface | Functions |
| --- | --- |
| Against which agent (PROF-DESC-011) | `takesNotifications` (`features.notifications`), `spaceSegmentsOf(space, { notifications })` (Notifications right after Conversations, for every member; none in Personal, whose approvals are the agent's) |
| The badges (PROF-TOOL-025) | `notificationsWaitingOf` (a space's), `withSpaceCount` (the agent's number after an event or a read, never added up), `NOTIFICATIONS_CHANGED` |
| An item (UI-APPR-002, UI-APPR-007, UI-APPR-008) | `notificationControlsOf` (Approve and Reject, Decide on your phone, or nothing), `notificationHeadingOf`, `notificationStatusOf` (the time left, the person's own decision, who decided and when, "you"), `decidedAtOf`, `approvalRefusalOf` |
| The requester's card (UI-APPR-005, UI-APPR-006) | `cardStatusOf` (waiting for the owner, then the outcome where it waited), `drawsApprovalCard` (a conversation never draws an approver's request, UI-APPR-001) |

The English wording is `NOTIFICATIONS_COPY`, the rows of the table of UI-CONV-052 for the Notifications and the card,
keyed by its path in the translation files.

## Profile 3.5 as amended on 2026-11-23: a source named by its feature, the addresses outside, three refusals

The owner's answers of 2026-11-23 to the clean spec (C1, C6, C7, F11, F13). A source carries the feature it serves
(`feature`, PROF-TOOL-035) on a card's action, in `metadata.sources`, in the sources of a conversation, on a space's
tool and on a Connect card, read by `featureRefOf`; `sourceNameOf` names every source the same way: "<feature> ·
<source>" ("CRM · Relaticle"), and its title once when the two titles are the same ("Web search") or when the agent
gave no feature. A card's action carries the addresses outside the organization the call would reach
(`outsideOrganization`, PROF-TOOL-007), which `tools.card.outsideOrganization` names. `toolRefusalOf` reads
`409 space-account-not-set` and `409 provider-not-used`; `NOTIFICATIONS_COPY` words `409 not-pending` to Decide on
your phone "This request was already decided or has ended.". `timeLeftOf` writes hours and minutes from one hour
("23 h 59 min"). The reducer marks an attachment the agent held back for a credential (`isAttachmentWithheld`, from its
`ayni.attachment` or from `ayni.messages.withheld` with no text for it), whose message reads
`CONVERSATION_COPY.attachmentWithheld`. The Info of a message held back for a credential is
`conversation.withheldCredentialInfo`, followed by `conversation.withheldCredentialAccounts` only for an agent that
declares `features.connections`.

## No test of the agent's version (the owner's answers of 2026-11-23)

A client tells the agent nothing of the version of the profile it implements, and asks nothing of the agent's but
the major version its descriptor declares (`discoverAgent`, UI-TRUST-001): what an agent serves is in its features
and its answers. `clientDescription(browser)` is `{ name, version, platform: "web", description }` for every agent
(PROF-SESS-014); `client.profileVersion`, `PROFILE_VERSION` and the description of a 3.0 agent are gone. A run carries
no `resume`: the profile has no interrupts. The text that only repeated a voice note's transcription, which an agent
of an earlier revision sent, is no longer dropped (`withoutVoiceEchoes` is gone): no agent sends it.

## Profile 3.5.2: a service that lets visitors in

`letsVisitorsIn(features)` says whether the agent's descriptor declares `features.visitors` (PROF-DESC-012): the agent
lets a person in without authenticating, as a visitor. The Proof of Trust card then shows
`PROOF_OF_TRUST_COPY.visitors`, "This service lets visitors in.", under the verdict, with the design's `visitors` size
and colour (UI-TRUST-008), and nothing of it for any other agent.

## Profile 3.5.4: a space's governance (agent D135 to D142)

One owner who controls a space, or none once the owner left with no successor; a successor the owner names; the
stewards of a template, who name an owner; the timeouts of the approvals of a space; and an approval policy per tool of a
space, whose approvers may be the owner, a person, any member, a role or a department, each required or optional. The
shapes of package 3.5.4 are written here (it is not on npm yet), with tolerant readers.

| Surface | Functions |
| --- | --- |
| A space with no owner, its successor (UI-CONV-041) | `SpaceInfo.owner` (`null` with none), `SpaceInfo.successor`, `ownerNameOf`, `handoverCandidatesOf` (who could own it, or succeed: an active member neither owner nor guest) |
| The approval timeouts (UI-CONV-041) | `SpaceRules.approvalTimeouts`, `TemplateBounds.approvalTimeouts`, `timeoutChoicesOf`, `timeoutFits` |
| Spaces you steward (UI-CONV-068) | `stewardshipOf` (no owner first), `ownerCandidatesOf`, `stewardReasonFits`, `stewardRefusalOf`; `ProfileClient.stewardship`, `ownerCandidates`, `nameOwner`, `setSuccessor`, `clearSuccessor` |
| The policy of a tool (UI-CONV-067, UI-CONV-049) | `approvalPolicyOf` (`SpaceToolItem.approval`), `policyRuleWordsOf`, `entryWordsOf`, `ruleGroupsOf` (by policy too), `policyFormOf`, `withApprovers`, `defaultWhenApproverAsksOf`, `minApprovalsOf`, `lowerThreshold`, `addableKindsOf`, `policyInputOf`, `policyChanged`, `policyRefusalOf` (also through `toolRefusalOf`), `attentionEntriesOf`, `toolsNeedingAttention`, `blockedNamesOf`; `patchSpaceTool(…, { approvals })` |
| Where an approval stands (UI-APPR-010) | `approvalProgressOf`, `progressLineOf`, `cardStatusOf` and `notificationStatusOf` (`progress`, `noApprover`), `deciderProgressOf`, `withApprovalUpdate` (keeps `progress`), `isOwnConfirmation`, `notificationHeadingOf` (`ownRequest`), `notificationControlsOf` (an own confirmation: on the phone) |
| The notices (UI-APPR-011) | `NotificationItem` (an approval or a notice), `isApprovalItem`, `governanceNoticeOf`, `noticeWordsOf`, `noticeControlOf` |

The English wording is `GOVERNANCE_COPY`, keyed by its path in the translation files.

Published to npm from this repository by the `npm-publish` workflow whenever `package.json` carries a version that is
not on npm yet.
