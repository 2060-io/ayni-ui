# Hologram UI

The browser face of a **Verifiable User Agent**: talk to any number of Hologram Agents from one
place, after checking each agent's Proof-of-Trust, while everything trust-bound (identity,
credentials, challenges, calls) stays on the person's Hologram App, which serves as the capability
channel. Specified by [hologram-spec v3](https://github.com/2060-io/hologram-spec/tree/main/v3/hologram-ui);
the wire contract is the [Hologram AG-UI Profile v3](https://github.com/2060-io/hologram-spec/tree/main/v3/hologram-agui-profile).

## Layout

| Path | What it holds | Spec areas |
|------|---------------|------------|
| `packages/core/` | `@2060.io/hologram-ui-core`: framework-independent TypeScript (descriptor discovery, trust resolution, directory search, the profile client with its SSE reader, the AG-UI event reducer, the IndexedDB device store, the tab sync bus with leader election) | UI-SHELL-004, UI-TRUST, UI-AGENTS, UI-SESS, UI-CONV |
| `packages/agui-profile/` | a copy of `@2060.io/hologram-agui-profile` from `hologram-agent` (`SOURCE` names the commit; `scripts/sync-profile.sh` refreshes it) | PROF-* |
| `src/state/` | runtime configuration and brand (`config.ts`), the application hub: store, leadership per session, streams, runs, actions (`hub.ts`) | UI-SHELL-005..010, UI-SESS-*, UI-PLAT-004 |
| `src/components/` | the shell: agent rail, conversation column, conversation pane (transcript, cards, composer, binding, closure banners), trust card, directory, add agent (URL, DID, QR), settings, details panel | UI-SHELL-001/002/011/012/013, UI-BIND, UI-CONV, UI-APPR, UI-CAP, UI-MEDIA, UI-AGENTS, UI-I18N, UI-THEME, UI-A11Y |
| `src/i18n/` | en, es, fr, pt | UI-I18N-003 |
| `public/` | `config.json` (runtime), `brand/` (name, logo, colours, links), the web app manifest | UI-PLAT-001/004, UI-THEME-001/002 |
| `docker/`, `Dockerfile` | static files behind nginx; `config.json` and the CSP rendered from the environment at start | UI-PLAT-004, UI-SEC-001 |
| `charts/hologram-ui/` | Helm chart | |

[DECISIONS.md](DECISIONS.md) records the implementation decisions.

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:5173, config from public/config.json (devnet registry and graph)
```

Open the UI, add an agent by URL or DID (a local Hologram Agent answers at `http://localhost:3020`),
check its trust card, press Connect, scan the QR with the Hologram App and confirm the code on the
phone. `pnpm test` runs the core tests (reducer, trust discovery, directory, SSE); `pnpm build`
produces the static bundle with the service worker.

## Configuration

The image serves static files; at start `docker/entrypoint.sh` renders `config.json` from the
variables of the specification's reference implementation profile (`PUBLIC_URL`, `DEFAULT_AGENT`,
`SINGLE_AGENT`, `TRUST_POLICY`, `TRUST_RECHECK_INTERVAL_SECONDS`, `VERANA_INDEXER_URL`,
`VERANA_GRAPH_URL`, `DID_RESOLVER_URL`, `ALLOWED_AGENT_ORIGINS`, `BRAND_CONFIG_URL`, `LOCALES`,
`DEFAULT_LOCALE`, `SOUNDS_ENABLED`, `INSTALL_PROMPT_ENABLED`). The UI holds no secrets. The embeddable
single-agent mode is `?agent=<descriptor>&single=1` or `SINGLE_AGENT=true` with `DEFAULT_AGENT`.

## What stays on the phone

Authentication, credential exchange, auth challenges (device, face match, document) and calls are
served on the wallet app; the UI only shows "continue on your phone" cards from
`hologram.capability.routed`. There is no DIDComm, no key and no credential in the browser.
