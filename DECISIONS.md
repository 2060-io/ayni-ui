# Implementation decisions

1. **Stack.** TypeScript, Vite, React 19, a framework-independent core package (`packages/core`)
   that depends only on web platform primitives (fetch, streams, IndexedDB through `idb`,
   BroadcastChannel, Web Locks). Project conventions from `2060-io/ts-project-template` (Biome,
   pnpm, vitest, reusable CI/CD, Helm chart).
2. **Profile package.** The wire types come from `@2060.io/hologram-agui-profile`, whose source of
   truth is `hologram-agent/packages/agui-profile`. Until it is published to a registry the package
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
   its `HologramAgUI` service in the resolved services. No DID resolver is embedded.
6. **CSP.** The policy is static: `connect-src 'self' https:` plus the configured agent origins;
   origins added at runtime are not appended to the header (a header cannot change at runtime).
   The agent list in the store is the runtime allow-list for calls the UI makes.
7. **Inline menus** are answered with `menu.select` (the agent delivers them as activities and does
   not suspend runs with interrupts).
8. **Closure.** A `410` or a `hologram.session.state{closed}` deletes the token, keeps the transcript
   read-only, shows the reason in plain words and offers one-click re-binding; channel-level reasons
   close every conversation of the agent (the agent closes them; the UI reflects each).
9. **Voice notes** use `MediaRecorder` with the first supported container among webm/opus, ogg/opus
   and mp4; the agent lists accepted types in the descriptor.
10. **Not done.** Browser-side calls, push notifications (by design), E2E encrypted cache (v4),
    automated accessibility audit in CI (axe) and a browser end-to-end test suite.
