# Changelog

## [0.3.1](https://github.com/2060-io/ayni-ui/compare/v0.3.0...v0.3.1) (2026-10-14)


### Bug Fixes

* **chart:** name the chart ayni-ui-chart so it no longer overwrites the image tag ([309557c](https://github.com/2060-io/ayni-ui/commit/309557cbdadac036dd33fa95fbb33995499e92ca))
* **chart:** name the chart ayni-ui-chart so it no longer overwrites the image tag on Docker Hub ([3db6b50](https://github.com/2060-io/ayni-ui/commit/3db6b501c91022d5102e9d40c18c632827dc8514))
* **store:** the pre-rename browser database is migrated once into the new one (D14) ([97871d9](https://github.com/2060-io/ayni-ui/commit/97871d9106a8d040255a639adc50cfd6f144fdd9))

## [0.3.0](https://github.com/2060-io/ayni-ui/compare/v0.2.0...v0.3.0) (2026-10-14)


### Features

* **chart:** ingress with cert-manager and nginx ([edca898](https://github.com/2060-io/ayni-ui/commit/edca8987cf9c450c34e8cd092c43cf52eb35dea4))
* **chart:** ingress with cert-manager and nginx ([70df6a4](https://github.com/2060-io/ayni-ui/commit/70df6a4fdc6dfdada014eae0e40105fb51416699))

## [0.2.0](https://github.com/2060-io/ayni-ui/compare/v0.1.0...v0.2.0) (2026-10-14)


### Features

* **agents:** refresh stored descriptors at start and on connect, so feature changes such as voice notes apply ([341f445](https://github.com/2060-io/ayni-ui/commit/341f44543a484a210409062bbc94242923ca6432))
* **binding:** device handle and the phone-driven re-link (PROF-BIND-009) ([f045627](https://github.com/2060-io/ayni-ui/commit/f04562725d1683948be88804ad5dea1c69f348f5))
* **binding:** hint for manual pairing from the app's menu ([a73f824](https://github.com/2060-io/ayni-ui/commit/a73f82477bf4a9095089417db3aba14a63562370))
* **binding:** send the device handle on connect, keep it from session.bound, show the phone-asked hint ([ac6d8d8](https://github.com/2060-io/ayni-ui/commit/ac6d8d88f3dd5dc928539de353aa4d3058526d95))
* **chart:** namespace value, default ayni ([cff57fd](https://github.com/2060-io/ayni-ui/commit/cff57fd967fb251c4c7002f6bc50fa11159b4a65))
* **column:** controller header shows the kind icon, the country flag and the name; stored controllers gain their country ([7f232b1](https://github.com/2060-io/ayni-ui/commit/7f232b1236305d9758765adc744c880a72085442))
* **column:** controller header with kind icon, country flag and name ([3c538bf](https://github.com/2060-io/ayni-ui/commit/3c538bf6fe38c5d2f22eed768e7d869b40b4091b))
* **column:** search conversations by title and cached transcript text, with the matching excerpt (UI-SHELL-015) ([bb06a4d](https://github.com/2060-io/ayni-ui/commit/bb06a4dc6f2cee0883750c50c1df1bcb9d890d96))
* **column:** terms and privacy links from the ECS Service credential under the agent name ([5b05b78](https://github.com/2060-io/ayni-ui/commit/5b05b78b3d55190aa9a027926e89929f6d13c731))
* **conversation:** in-conversation search with occurrence count, previous/next, highlighted hits and load-earlier; column match counts; phone-width conversation leak fixed (UI-CONV-020, UI-SHELL-015, UI-SHELL-013) ([d80560b](https://github.com/2060-io/ayni-ui/commit/d80560b502bd2dcc0c617dff4b45095a1903cd50))
* **conversation:** message toolbar, single reactions with picker, replies, message info, infinite history, collapsible panel, pinned rail with drag and drop, one-line composer (UI-CONV-011/012/013/016/017/018/019, UI-SHELL-011/014) ([7c2b9a2](https://github.com/2060-io/ayni-ui/commit/7c2b9a234570f15342eac9669aa33d0dbb460f6b))
* **conversations:** the list comes from the agent: sync, open listed conversations, archive/unarchive, archive all, close for good, rename through the agent (D31, UI-SESS-001/004/011..013) ([51e2846](https://github.com/2060-io/ayni-ui/commit/51e28462acb78c80e1132cf8810a8aba6f200223))
* **conversation:** thinking indicator while a run has produced no text yet ([30738b5](https://github.com/2060-io/ayni-ui/commit/30738b5113dda1f5b08d41f20c3b7011875f3958))
* **markdown:** headings, block quotes, rules, bold-italic, strike-through and the inline tags u/b/i/em/strong/s (UI-CONV-002) ([705404d](https://github.com/2060-io/ayni-ui/commit/705404d7033e19f879e9053e2055cb01dde8a298))
* **sessions:** paired devices: silent binding with the device proof, rotated secret, disconnect and linked devices (D30, UI-BIND-011, UI-SESS-010, UI-AGENTS-006) ([758e1a2](https://github.com/2060-io/ayni-ui/commit/758e1a2b06e4db429013e6875a7bdcb87577177b))
* **sessions:** routine closures are silent; closed conversations list like the others and wake on writing (D21/D26, UI-SESS-003) ([e5f0f95](https://github.com/2060-io/ayni-ui/commit/e5f0f95118031592a1ed43ea3ca32d848c5c2ecc))
* **sessions:** writing on a closed conversation resumes it (PROF-SESS-009, UI-SESS-003) ([c2e06cc](https://github.com/2060-io/ayni-ui/commit/c2e06ccc1126d69820c7001f48fcbb5fdc4c13d2))
* **sessions:** writing on a closed conversation resumes it (PROF-SESS-009, UI-SESS-003) ([7a426c3](https://github.com/2060-io/ayni-ui/commit/7a426c37787bda75c44e8333835af3d532649cdf))
* **settings:** accent colour choice (swatches, custom colour, default) applied over the brand ([a9145f3](https://github.com/2060-io/ayni-ui/commit/a9145f3bf781d03c4aa1595c84299241890fcd3c))
* **shell:** controller-first shell: controller rail, agent cards with trust icon and menu, add page with two entries, side sheet instead of the right panel, header without trust and panel buttons (D32, UI-SHELL-001/002/011/014, UI-AGENTS-001) ([7605345](https://github.com/2060-io/ayni-ui/commit/76053457d7f4564ee02450df93ad79bc99c207b1))
* **shell:** draggable splitter between the column and the conversation, width kept per browser profile ([fb770ac](https://github.com/2060-io/ayni-ui/commit/fb770ac77493c4f62174ef5abca3141fa5103534))
* the Ayni UI (ayni-spec v3) ([43d08f5](https://github.com/2060-io/ayni-ui/commit/43d08f517302cdc13347bf06ac41c13c56add3f9))
* the Hologram UI (hologram-spec v3) ([f926fae](https://github.com/2060-io/ayni-ui/commit/f926faedf324e03d69452db5f4479db204bd901f))
* **trust:** Proof of Trust as a view of the conversation area; every non-list view takes the screen at phone width ([81c3503](https://github.com/2060-io/ayni-ui/commit/81c3503a1cd2aa38d7eb928b55f2bd8ef0f5472a))
* **trust:** Proof of Trust card over the conversation: identity credentials with claims, other credentials, accreditation chains, DID Document endpoints, governance (D33, UI-TRUST-002) ([8994d86](https://github.com/2060-io/ayni-ui/commit/8994d86b9d7007aa19c2f830e481f7ef6da33cf5))


### Bug Fixes

* **a11y:** kind icons as images, splitter as a separator element ([0f5f66e](https://github.com/2060-io/ayni-ui/commit/0f5f66ed67601452a71d034db87df83998b27b0c))
* **a11y:** the flag is an image ([dcb87d4](https://github.com/2060-io/ayni-ui/commit/dcb87d496400438cd32689a6420dfaf7aff0677a))
* **agents:** records that still point at the old descriptor path refresh from the new one ([70856ea](https://github.com/2060-io/ayni-ui/commit/70856ea4a913a5efa317d8be9ca7de53a0bafd4a))
* **attachments:** no bubble; rows place the person's attachments on the right ([5df8939](https://github.com/2060-io/ayni-ui/commit/5df89393e878a3721b54a64ca186b9d596693dd8))
* **attachments:** the person's attachments on the right, thumbnails keep their proportions; profile synced ([d53a168](https://github.com/2060-io/ayni-ui/commit/d53a168d4818b23f5172eb52cdbdb060e1130a84))
* **avatar:** fall back to initials when the logo cannot load ([7f080e1](https://github.com/2060-io/ayni-ui/commit/7f080e10200ab14a8874ee552888ce4f9a1f8348))
* **column:** hovering an agent colours its name instead of its row ([ca989bc](https://github.com/2060-io/ayni-ui/commit/ca989bc364fd35b35b33b561b3ebc81c25ab0551))
* **column:** larger agent icon beside a name-and-links block, both vertically centred ([583436a](https://github.com/2060-io/ayni-ui/commit/583436a3e06abcfe1bbd403f165482648aeeabe8))
* **column:** links closer to the agent name ([e6c4224](https://github.com/2060-io/ayni-ui/commit/e6c422463ba330fa7d29f9befd02e2b9d14b0258))
* **column:** links no longer under the agent row; row tightened instead of overlapped ([8046db2](https://github.com/2060-io/ayni-ui/commit/8046db28393077990477a8653048530dc1b1de8e))
* **column:** selected conversation without the left bar ([34f8000](https://github.com/2060-io/ayni-ui/commit/34f80001dcb8440d893a54a3b9c271a36a01c400))
* **column:** terms and privacy links aligned with the agent name ([6455ea4](https://github.com/2060-io/ayni-ui/commit/6455ea462d5eeb427a78f3ddda7e6072365d808c))
* **column:** the selected conversation stands out (accent tint and bar) ([7c69b67](https://github.com/2060-io/ayni-ui/commit/7c69b67187174d31547e65658e7a84cc4067975b))
* **column:** trust icon right after the agent name ([d20fa10](https://github.com/2060-io/ayni-ui/commit/d20fa10af1dfda35d3071d2b96d94d031497615b))
* **composer:** focused field border visible again (rule order) ([16498b6](https://github.com/2060-io/ayni-ui/commit/16498b667a4f5eba71b5922624dae5d065b79783))
* **composer:** microphone to the right of the send control ([33e16cc](https://github.com/2060-io/ayni-ui/commit/33e16cc6d588038d2c8a76b2fbbf9ec024f9dcc7))
* **composer:** no scrollbar until the field reaches its six-line cap (UI-CONV-013) ([c72f77d](https://github.com/2060-io/ayni-ui/commit/c72f77de57a76fe91ccd383f65f185b1066ac642))
* **composer:** plus, send and microphone as equal 40px circles with one gap ([a2f3ee2](https://github.com/2060-io/ayni-ui/commit/a2f3ee26e6f6b18adfb58b45827482c75aa26e00))
* **controllers:** key organizations by registry identity, not the credential subject; re-file trusted agents left under themselves (D32) ([79cba5b](https://github.com/2060-io/ayni-ui/commit/79cba5be7912083ad2fc4595555db7f17910588b))
* **conversation:** guard scrollIntoView for environments without it; tests green ([762f133](https://github.com/2060-io/ayni-ui/commit/762f13322cf5eb2243d3f0a18e6ee6b2f8bf3821))
* **conversation:** reaction pill clears the time stamp; thinner pill border ([01f84f7](https://github.com/2060-io/ayni-ui/commit/01f84f700829f7718f7da98dd8c7756749a09f4f))
* **conversations:** opening a listed conversation replaces its placeholder; only New conversation asks the agent for a fresh one; re-pairing continues the latest ([5140acb](https://github.com/2060-io/ayni-ui/commit/5140acbd9b4ca963b51d2d59dc5950cff39d942d))
* **core:** call fetch unbound in ProfileClient; surface connect errors ([443260d](https://github.com/2060-io/ayni-ui/commit/443260d709e8b59274da34fa51b0340cbe4a4a30))
* **core:** wrap fetch in ProfileClient (the previous commit missed the edit) ([55e8b30](https://github.com/2060-io/ayni-ui/commit/55e8b3020264f47e8a91b4bbcac69d199dfd1459))
* **docker:** the config script is sourced before nginx's envsubst so the CSP origins reach the ([e66533d](https://github.com/2060-io/ayni-ui/commit/e66533d2400e39c654132c507341e1ef6084e957))
* **forms:** focused fields keep only their own 1px border in accent ([7f38e24](https://github.com/2060-io/ayni-ui/commit/7f38e24ff553a9e8b314918ac6795f1e093b4d44))
* **forms:** thin accent border on focused fields instead of the thick ring ([6af68c4](https://github.com/2060-io/ayni-ui/commit/6af68c4b028c8ba3645883c45da36213882c1cb8))
* **hub:** a run indicator no tab drives is cleared when the leader reopens the stream or on Stop (UI-CONV-003) ([60a1f50](https://github.com/2060-io/ayni-ui/commit/60a1f5026e7650ecfd920d44852dca1febca13df))
* **hub:** archive and close for good write behind any list refresh in flight (UI-SESS-012) ([2eb5833](https://github.com/2060-io/ayni-ui/commit/2eb58331330374145893b84898ebdcfc30fb5c13))
* **hub:** never let one failing event poison the event queue; poll provisional sessions so the binding screen always leaves ([b62de07](https://github.com/2060-io/ayni-ui/commit/b62de072a986bb9762a7b372d182e64113343f5b))
* **hub:** one record per conversation and three streams per agent (D34, UI-SESS-014, UI-SHELL-016) ([2f9e8a8](https://github.com/2060-io/ayni-ui/commit/2f9e8a897a1f47997d4db11d147a4cd22afc2217))
* **hub:** Stop clears a leftover run indicator immediately in a tab that holds no run ([f80e4a0](https://github.com/2060-io/ayni-ui/commit/f80e4a084e3f4b1f15b197da74f2e4a2597c6dec))
* **hub:** wait for the run's queued events before marking a reply interrupted; no border around reactions and menus ([004928d](https://github.com/2060-io/ayni-ui/commit/004928df7f2531e5ebd96a6517501b3584f3205e))
* **menus:** agent, conversation and header menus close on an outside click or Escape ([21f4096](https://github.com/2060-io/ayni-ui/commit/21f4096381c9e626d6a16cd8f0269c12bbe191b6))
* **rail:** controller tiles fill the 48px tile like the plus one, no outline, selection as a vertical bar on the left ([f2b5419](https://github.com/2060-io/ayni-ui/commit/f2b5419bee49d016ac03ad869370602251477558))
* **runs:** reactions and receipts bypass the run lock; a stale lock from an unclosed run stream is released ([8f1990b](https://github.com/2060-io/ayni-ui/commit/8f1990b64c5fd5e8ab880bf50faca6b071d8092e))
* **search:** count and navigate over the rendered marks so markdown never desynchronises count, highlight and scroll ([57e03bc](https://github.com/2060-io/ayni-ui/commit/57e03bcc6e4bc592f76924239f6856f28c11b8d9))
* **search:** scroll the transcript itself to the current hit; test the step ([593f907](https://github.com/2060-io/ayni-ui/commit/593f907c73cbcde04e507b70755fa700d2792722))
* **shell:** back controls only at phone width (UI-SHELL-013) ([32582e3](https://github.com/2060-io/ayni-ui/commit/32582e3a44056ed6c71abec45859a712291759cd))
* **shell:** back controls visible again at phone width (UI-SHELL-013) ([bdb88d4](https://github.com/2060-io/ayni-ui/commit/bdb88d4b264156d5a5d2c15f07db441f721609b1))
* **shell:** column header and conversation header share one height ([77db149](https://github.com/2060-io/ayni-ui/commit/77db14932e346758cfd65f88ce2790dbc57ba88f))
* **shell:** controller tile logo at full tile size; no logo repeated in the column header ([a3f41f2](https://github.com/2060-io/ayni-ui/commit/a3f41f2258e0e72005961fa8b8457278ec52a64b))
* **shell:** settings has a close button; the settings and plus tiles toggle their page ([dbfde64](https://github.com/2060-io/ayni-ui/commit/dbfde6409d8b5aa0c3978c6f1572f0bdd6704efb))
* **trust:** closing the Proof of Trust returns to the view it was opened from ([824f812](https://github.com/2060-io/ayni-ui/commit/824f812c0fb70fc219b668db34f869785c5dce6d))
* **trust:** ECS labels, accreditation chain wording, long facts wrap ([c73a042](https://github.com/2060-io/ayni-ui/commit/c73a0420f7615ff73093050e87fd89b924d9e68b))
* **trust:** read termsAndConditionsUri and privacyPolicyUri from the Service credential ([92255c7](https://github.com/2060-io/ayni-ui/commit/92255c76b89ab85200f0a6457f87f91911b10a64))
