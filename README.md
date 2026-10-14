# Ayni UI

The browser face of a **Verifiable User Agent**: talk to any number of Ayni Agents from one
place, after checking each agent's Proof-of-Trust, while everything trust-bound (identity,
credentials, challenges, calls) stays on the person's wallet app, which serves as the capability
channel. Specified by [ayni-spec v3](https://github.com/2060-io/ayni-spec/tree/main/v3/ayni-ui);
the wire contract is the [Ayni AG-UI Profile v3](https://github.com/2060-io/ayni-spec/tree/main/v3/ayni-agui-profile).

## Layout

| Path | What it holds | Spec areas |
|------|---------------|------------|
| `packages/core/` | `@2060.io/ayni-ui-core`: framework-independent TypeScript (descriptor discovery, trust resolution, directory search, the profile client with its SSE reader, the AG-UI event reducer, the IndexedDB device store, the tab sync bus with leader election) | UI-SHELL-004, UI-TRUST, UI-AGENTS, UI-SESS, UI-CONV |
| `packages/agui-profile/` | a copy of `@2060.io/ayni-agui-profile` from `ayni-agent` (`SOURCE` names the commit; `scripts/sync-profile.sh` refreshes it) | PROF-* |
| `src/state/` | runtime configuration and brand (`config.ts`), the application hub: store, leadership per session, streams, runs, actions (`hub.ts`) | UI-SHELL-005..010, UI-SESS-*, UI-PLAT-004 |
| `src/components/` | the shell: agent rail, conversation column, conversation pane (transcript, cards, composer, binding, closure banners), trust card, directory, add agent (URL, DID, QR), settings, details panel | UI-SHELL-001/002/011/012/013, UI-BIND, UI-CONV, UI-APPR, UI-CAP, UI-MEDIA, UI-AGENTS, UI-I18N, UI-THEME, UI-A11Y |
| `src/i18n/` | en, es, fr, pt | UI-I18N-003 |
| `public/` | `config.json` (runtime), `brand/` (name, logo, colours, links), the web app manifest | UI-PLAT-001/004, UI-THEME-001/002 |
| `docker/`, `Dockerfile` | static files behind nginx; `config.json` and the CSP rendered from the environment at start | UI-PLAT-004, UI-SEC-001 |
| `charts/ayni-ui/` | Helm chart (`namespace` value, ingress) | |

[DECISIONS.md](DECISIONS.md) records the implementation decisions.

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:5173, config from public/config.json (devnet registry and graph)
```

Open the UI, add an agent by URL or DID (a local Ayni Agent answers at `http://localhost:3020`),
check its trust card, press Connect, scan the QR with the wallet app and confirm the code on the
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
`ayni.capability.routed`. There is no DIDComm, no key and no credential in the browser.

## Docker

```bash
docker build -t io2060/ayni-ui:local .
docker run --rm -p 8080:8080 -e DEFAULT_AGENT=http://localhost:3020 io2060/ayni-ui:local
```

## Continuous integration and releases

- **CI** (`.github/workflows/ci.yml`) runs on every pull request to `main` and on pushes: the shared
  2060 pipeline (install, build, format, types, unit tests, Helm chart lint, conventional PR title)
  plus a Docker image build without push.
- **CD** (`.github/workflows/cd.yml`) runs on pushes to `main`, `release/**` and `v[0-9]*` branches
  once the repository variable `CD_ENABLED` is `true`:
  - every push with releasable commits publishes a **dev prerelease** `vX.Y.Z-dev` (semantic-release),
    the image `io2060/ayni-ui:vX.Y.Z-dev` with the floating `dev`, `vX-dev`, `vX.Y-dev` tags from
    `main`, and the Helm chart `oci://docker.io/io2060/ayni-ui` at the same version;
  - **release-please** keeps a Release PR open on `main`; merging it creates the stable tag `vX.Y.Z`,
    the GitHub release with `CHANGELOG.md`, the image tags `vX.Y.Z`, `vX.Y`, `vX` and `latest`, the
    chart at `vX.Y.Z`, and a Discord announcement.
- Versions follow conventional commits: `fix:` bumps the patch, `feat:` the minor, `feat!:` the
  major (minor while below 1.0).
- Secrets and variables expected by CD: `DOCKER_HUB_LOGIN`, `DOCKER_HUB_PWD`,
  `DISCORD_UPDATES_WEBHOOK_URL` (secrets) and `CD_ENABLED` (variable).
