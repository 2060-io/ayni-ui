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
| A conversation | `CONVERSATION_DESIGN`, `CONVERSATION_COLORS` | `replyQuoteOf`, `reactionPillOf`, `plainText` |
| The home page (rail and column) | `HOME_DESIGN`, `HOME_COLORS` | `TRUST_MARK`, `CONTROLLER_KIND_ICON`, `formatTime` |
| The Proof of Trust | `PROOF_OF_TRUST_DESIGN`, `PROOF_OF_TRUST_COLORS` | `verdictOf`, `identityStepOf`, `accreditationLine`, `otherCredentialLine`, `claimRows`, and its English wording (`PROOF_OF_TRUST_COPY`) |

The browser's stylesheet is the reference: tests in this repository compare it, and the English translation file,
with these values, so a change made on one side only fails. The app builds its styles from the same values. A change
of look or wording on one of these surfaces starts here.

Published to npm from this repository by the `npm-publish` workflow whenever `package.json` carries a version that is
not on npm yet.
