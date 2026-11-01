# CDN stability implementation plan

Status: feasibility, map/lock generation, and both consumer APIs are implemented locally for the exact published alpha. The published `2.0.0-alpha.0` remains unchanged and does not contain the new APIs; consumer use requires a later exact prerelease.

## Feasibility checkpoint (2026-11-01)

- npm dist-tags are `next: 2.0.0-alpha.0` and `latest: 1.15.0`. The exact alpha's
  registry manifest, root `cdn-contract.json`, and browser entrypoints are published.
  The contract is at the package root, not under `dist/`.
- PR #109 is merged at the local `origin/main` head. Its six Node/OS CI jobs and
  Codecov checks passed; no approval or requested-change gate remained.
- `@jspm/generator` 2.11.0 with its `jspm.io` provider (`ga.jspm.io`) resolved the
  published core, `/react`, and `/transform` entries, plus exact React and React DOM
  consumer entries. The generated import map covered the traced browser modules,
  including `magic-string`, `@jridgewell/sourcemap-codec`, `@tybys/wasm-util`, and
  `@emnapi/wasi-threads`. `@jspm/generator@2.11.0` is now a JSX dev dependency.
- `cdn-importmap-lock.json` is the tracked, version-independent source of truth for the
  third-party graph. Its self-package URL uses a token rather than an alpha version.
  Candidate check re-bases that token to the package's current exact version, freeze-traces
  the local build, and materializes `dist/cdn-importmap.json`; `prepack` and E2E use this
  path. The concrete map is a generated package artifact under ignored `dist`, not a
  per-release source change. Intentional graph changes use candidate update mode to refresh
  the tracked lock. Published mode remains available for live verification. The npm
  `pretest` hook also runs candidate check after build so unit tests can read the ignored
  dist manifest in CI.
- The generator uses a non-local base URL and exact `npm:` install targets so it cannot
  resolve the working tree as the package source. Candidate mode supplies local built files
  at the future exact JSPM URL. A simulated alpha.0-to-alpha.1 package-version-only change
  materialized alpha.1 self URLs while leaving the tracked lock byte-identical.
- **Candidate release generation is implemented.** The `--candidate` mode feeds the
  locally built `dist/` files and package manifest to JSPM as virtual source at the future
  exact package URL. Candidate update/check commands work before the candidate is
  published; `prepack` and E2E use candidate check mode. The normal update/check commands
  still trace published package versions. The current alpha.0 candidate check and prepack
  pass, and an alpha.1 virtual-source probe produced/froze a lock under its future exact
  URL. Post-publication Chromium verification uses
  `KNIGHTED_CDN_IMPORTMAP_LIVE=1` to bypass the local candidate route and fetch the actual
  package from the provider.
- Generation must supply explicit resolutions for `@napi-rs/wasm-runtime@1.2.5`,
  `@emnapi/core@2.0.0-alpha.6`, `@emnapi/runtime@2.0.0-alpha.6`, and the tested
  `react@19.3.1` / `react-dom@19.3.1` pair. The generated React DOM graph also pins
  `scheduler@0.28.0`. An unconfigured run selected runtime 1.2.6 and incompatible
  emnapi resolutions; that output must be rejected, never accepted as a successful
  resolution.
- In standalone Chromium, the exact alpha parsed DOM JSX, rendered a React component
  using hooks through React DOM while `reactJsx` produced a valid element from the same
  React 19.3.1 instance, and transformed TypeScript/JSX with no diagnostics. Both parser
  and transformer WASM assets loaded from exact `0.156.0` package paths with HTTP 200.
  The Playwright audit verified every observed provider request was covered by a locked
  package URL. Focused unit tests cover schema, transitive edges, compatibility pins,
  deterministic serialization, package artifact inclusion, and version-only lock reuse.
- The observed graph used separate provider modules, not a vendor bundle, and needed no
  handwritten consumer dependency patches. JSPM-generated helper modules were served
  beneath the versioned alpha package URL. Exact versions do not make those generated
  bytes immutable; the release must preserve and validate its generated map/lock rather
  than regenerating at runtime.
- The browser run did not request a worker. Worker loading is unsupported until its
  independent graph is traced and tested; the document import map is not evidence that
  a worker inherits those mappings.
- jsDelivr's `+esm` entrypoints retain bare imports and the existing contract does not
  constrain their transitive resolution. The esm.sh URL helper's selected `deps` are
  also not a complete lock. Neither path is selected for the initial prototype.
- The OXC binding-generation mismatch is tracked in napi-rs/napi-rs#3674, which is open
  with no linked PR as of this checkpoint. The related napi-rs/napi-rs#3621 runtime-plugin
  ABI issue closed via #3650, but that is distinct: both published OXC `0.156.0` WASM
  bindings still declare emnapi alpha.6 and `@napi-rs/wasm-runtime ~1.2.6`, while
  runtime 1.2.6 peers with beta.2. Retain and explicitly encode the tested
  runtime-1.2.5/alpha.6 compatibility resolution until a compatible OXC binding is
  published and verified.
- The exact JSPM lock will not silently float when upstream changes. Once a compatible
  binding is published, deliberately refresh the lock for a new exact JSX release and
  rerun browser validation. JSPM can then trace the newly published dependency metadata;
  remove the workaround only after that graph passes compatibility checks.

Prototype provider strategy: use JSPM graph tracing against exact published package
versions to produce a release-owned import map and lock, with the compatibility and peer
resolutions above. Keep provider output validation strict; do not use runtime resolution,
cross-provider fallback, or a vendor bundle.

## Goals

- Consume `@knighted/jsx` directly from a CDN without a consumer build step.
- Freeze the resolved browser graph, including direct, transitive, and peer dependencies.
- Keep ordinary ESM imports and avoid publishing a vendor bundle.
- Make the common DOM-only workflow simple and load React or transformation support only
  when requested.
- Preserve React module identity across the application, React DOM, and `reactJsx`.
- Make dependency upgrades deliberate, versioned, and browser-tested.

Non-goals: deterministic behavior for arbitrary CDN URLs, automatic migration of an
already-loaded module graph, and guarantees that a third-party CDN remains available.
Exact dependency resolutions do not guarantee byte-identical CDN-generated code.

## Current limitations

- `getStableCdnUrls` supplies selected dependency overrides to esm.sh but does not lock
  the complete browser graph.
- Its jsDelivr path returns `+esm` entry URLs without applying the dependency overrides.
- Contract generation strips ranges from declared versions instead of capturing the
  resolved graph used by the browser.
- The local browser fixture contains handwritten URL remappings unavailable through the
  consumer API.
- A local npm lockfile does not constrain a remote CDN's dependency resolution.

The OXC upgrade and CDN work remain separate. The upgrade-only `@knighted/jsx@2.0.0-alpha.0`
is the exact feasibility target; it remains published unchanged and does not contain the
new helper APIs. The local API and package changes require a later exact prerelease before
they can be used from a CDN.

### Upstream runtime constraint

Continue the v2 alpha prototype while tracking the OXC/NAPI-RS dependency-generation
issue described in [CLI setup](cli.md#oxc-01560-runtime-compatibility-workaround).
OXC's workspace pins WASM runtime 1.2.5 with emnapi alpha.6, but generated binding
0.156.0 declares runtime `~1.2.6`, whose peer requirements exclude alpha.6.

The CLI's version-scoped npm workaround does not constrain CDN resolution. The CDN
prototype must independently lock and browser-test a compatible binding/runtime pair;
do not infer browser compatibility from the CLI's successful Node tests. Record any
temporary compatibility override explicitly in the browser manifest and generated map.
Reject provider output that bypasses it rather than silently accepting an unlocked graph.

Report the generator mismatch upstream and track its resolution. Before stable v2,
adopt and verify an upstream fix or explicitly decide to maintain the workaround and
complete the documented package-manager support. Alpha status does not waive these
compatibility checks. Keep the detailed dependency explanation in the linked CLI guide.

## Consumer experience

### Recommended: one runtime loader

Implemented locally. `<release>` must be replaced with an exact published package version
containing the helper; this does not work against the upgrade-only `2.0.0-alpha.0`:

```html
<script type="module">
  import { loadStableCdn } from 'https://cdn.jsdelivr.net/npm/@knighted/jsx@<release>/dist/cdn-stable.js'

  const { jsx } = await loadStableCdn()
  document.body.append(jsx`<h1>Hello</h1>`)
</script>
```

The default loads only the DOM runtime. Optional entries are explicit:

```js
const { jsx, reactJsx } = await loadStableCdn({ entries: ['core', 'react'] })
const { transformJsxSource } = await loadStableCdn({ entries: ['transform'] })
```

The bootstrap must have no third-party runtime imports. It loads the release's frozen
manifest, installs the necessary import map, and only then dynamically imports the
requested entrypoints. Repeated compatible calls share initialization and module identity.

Do not silently select `latest`, regenerate a graph at runtime, or fall back to an
unlocked provider. Provider selection defaults to the release's tested provider.

### Advanced: import-map ownership

`getStableCdnImportMap` returns a standard `{ imports, scopes }` map without mutating the
document. Consumers can inline it before module preloads/imports or install it from an
early bootstrap module. This path permits normal bare imports such as:

```js
import { jsx } from '@knighted/jsx'
import { reactJsx } from '@knighted/jsx/react'
```

The README documents inline map installation; native external `<script type="importmap"
src="...">` is not a supported installation pattern. Consumers do not need JSPM or need
to assemble dependency URLs manually.

### Existing applications and peers

- Accept existing peer mappings only when their effective URLs match the map's tested
  canonical React/ReactDOM pair. Conflicting mappings are rejected. Arbitrary alternate
  peer URLs are not supported by the initial API.
- Default to the tested exact React/React DOM pair `19.3.1`.
- Use scopes for legitimate dependency-version coexistence, not duplicate React instances
  within the same application tree.
- Detect visible mapping conflicts and reject them rather than replacing host mappings.
- Require setup before the affected packages resolve. Import maps cannot replace modules
  already resolved or loaded; DOM inspection cannot detect every prior resolution.
- Do not globally remap unrelated application packages or silently overwrite host maps.

## Architecture

### Release-owned browser lock

Extend or replace the existing contract with a versioned manifest containing:

- Exact package identities and versions, entrypoints, browser export conditions, and
  dependency relationships per supported entry.
- Provider-specific module URLs, scopes, final redirect targets, and relevant asset URLs.
- Peer constraints and the exact compatible defaults used for release verification.
- Manifest schema version and the matching `@knighted/jsx` release version.

Use a proven dependency/import-map generator where feasible. `@jspm/generator` 2.11.0
with the `jspm.io` provider is verified for the exact alpha graph. Always give it a
non-local `baseUrl`/`mapUrl` and exact `npm:` install targets: without those, running from
the package root can self-resolve local `@knighted/jsx` files instead of the published
release. Reassess the provider if it cannot satisfy these checks for a future release.

Seed generation from the verified dependency versions and preserve the resulting lock
between runs. Ordinary release builds validate it without re-resolving ranges; intentional
dependency updates explicitly refresh it. An entry change must invalidate its affected
graph, including peer compatibility.

The graph must represent browser-reachable code, not every dev dependency in npm's lockfile.
Include dynamic imports, browser condition substitutions, and runtime transitives such as
`property-information`, `@tybys/wasm-util`, `tslib`, and any dependencies reachable from the
transformation entry. Do not flatten incompatible versions into one name-to-version table.

### Supported CDN strategy

Initially support one verified provider strategy. Prefer versioned, separately served ESM
files with dependencies resolved through the generated map. CDN transformations may be
necessary for CommonJS dependencies, but they must not hide mutable resolution inside
opaque bundles or introduce dependencies the lock cannot control.

Inspect emitted imports and redirects rather than assuming bare-specifier pins are enough.
Absolute imports require matching URL mappings; relative imports resolve against their
owning module URLs. A provider-specific map must cover the graph actually emitted.

WASM fetches and `new URL(...)` assets are not governed by import maps. Verify their
versioned package bases and recorded locations separately. Workers have independent
module resolution and do not inherit the document's import map. Support them only with a
verified locked worker graph; otherwise report that entry/provider combination unsupported.

Additional providers can reuse the logical lock but need their own maps and browser tests.
Cross-provider fallback is allowed only when both graphs preserve the same locked versions
and peer identity; omit fallback from the initial implementation.

## Implementation milestones

1. **Prove feasibility. Complete for alpha.0.** The exact package and CDN files were
   verified; DOM parsing, React hooks/identity, and browser TypeScript/JSX transformation
   passed in standalone Chromium. Module requests and WASM asset URLs were audited against
   the generated lock without a vendor bundle.
2. **Generate and validate the frozen map. Complete for alpha.0.** The
   explicit update/check commands, schema validation, map/lock artifacts, graph tests, and
   browser audit are implemented. The stable third-party lock is tracked; the concrete
   exact-version map is generated into `dist` and included by the package allowlist.
3. **Implement the consumer APIs. Complete locally.** `loadStableCdn` installs only
   missing compatible mappings and imports requested entries; `getStableCdnImportMap`
   returns the validated map without document mutation. User-facing release remains
   pending a new exact prerelease containing these changes.
4. **Adopt in the demo.** Replace handwritten dependency patches and mismatched preloads
   with the new bootstrap. Keep the existing demo design unchanged. Ensure startup failures
   replace the loading state with an actionable error rather than leaving a spinner.
5. **Release and document.** The pre-publication graph workflow is implemented. For a
   version-only release, candidate check should materialize the new exact self URLs without
   refreshing the third-party lock. If the graph changes, refresh the lock deliberately
   and browser-test it. Bump the package version only after authorization, then run
   candidate check, prepack, package-content checks, and standalone Chromium against the
   local candidate. Publish only with explicit authorization, then run the live-CDN smoke
   test with `KNIGHTED_CDN_IMPORTMAP_LIVE=1`.

New generator dependencies, publishing/build changes, and public API changes require
approval before implementation under the repository's existing boundaries.

## Verification and acceptance

- Unit tests cover manifest validation, graph completeness, deterministic serialization,
  scopes, peer identity, visible map conflicts, loader option validation, and artifact
  inclusion.
- Chromium covers DOM, React hooks, shared React identity, JSX/TypeScript transformation,
  repeated loader calls, package module requests, and WASM assets. Broader browser coverage
  for map composition remains a pre-stable-release gate.
- Simulate an upstream version change using intercepted CDN responses. The locked graph
  must remain unchanged or fail explicitly, not silently load the new dependency.
- Audit actual module requests/imports and asset requests against the manifest. Supplement
  network observation with import analysis because cached or inlined code can hide edges.
- Run Chromium first, then Firefox and WebKit for import-map installation and composition.
  Test workers separately if any supported entry uses them.
- Test the packed package's bootstrap and manifest paths before release. A post-publication
  smoke test verifies the actual CDN release in a fresh browser context.
- Add scheduled live-CDN checks to detect provider changes after release; report failure
  rather than automatically regenerating the lock.
- Continue the repository's type, lint, formatting, build, and focused test gates. No
  consumer vendor bundle and no handwritten dependency remappings are acceptance criteria.

## Versioning and migration

### Legacy CDN contract decision

`cdn-contract.json`, its package export, and `getStableCdnUrls`/`buildStableCdnUrls` are
legacy selected-pin tooling, not a complete browser lock. They are not deprecated yet and
remain available during the alpha period so existing consumers are not broken mid-prototype.

Before the v2 release candidate, decide whether to remove them from stable v2. Prefer
removal if the JSPM map/lock and both consumer APIs pass the release gates and no supported
workflow still needs the old URL builder. If retained, document its limited guarantees and
do not label its URLs as fully locked.

If removing the legacy contract, do so as one coordinated v2 change: remove its JSON
package export and generated file, generator/check scripts and prepack steps, legacy
helper functions/types, tests, and README/runtime-helper examples. Document migration from
`getStableCdnUrls` to `loadStableCdn` for runtime loading or `getStableCdnImportMap` for
host-owned import-map setup. Keep the JSPM import map and lock as the sole complete graph
source of truth.

Use a v2 alpha series for real-CDN testing, starting with the upgrade-only
`2.0.0-alpha.0`. Publish each subsequent implementation snapshot with a new exact
prerelease version under `next`; do not change the stable `latest` dist-tag. Use `rc`
versions only once the API and release gates are ready for final verification.

Every prototype, import map, manifest, and automated test must use an exact package
version, never a moving `next`, `alpha`, or `latest` URL. Regenerate release-specific
root URLs for each new prerelease while preserving unchanged dependency resolutions.
Publishing is performed only with explicit user authorization, not automatically by
the implementation workflow.

Prefer adding the new APIs first without changing existing helper behavior. Document
the older URL helper's actual limits instead of claiming complete determinism.

Removing the old helper or changing its return contract/defaults is a v2 breaking change.
Making existing supported workflows require import-map installation is also breaking.
A v2 may provide a cleaner unified API, but versioning alone does not fix dependency
resolution.

Confirm the final stable release's API and migration requirements after the feasibility
milestone and a consumer compatibility check. The v2 prerelease testing path does not
require removing the existing APIs or combining the dependency upgrade and CDN work
into one commit.
