# CDN stability implementation plan

Status: proposed. API names and provider selection below are not implemented.

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

Keep the OXC upgrade and CDN implementation in separate commits. Publish the committed
upgrade as `@knighted/jsx@2.0.0-alpha.0` under the `next` dist-tag, then use that exact
version as the initial CDN prototype target. This tests the current OXC graph without
requiring another dependency upgrade. The initial alpha does not contain the proposed
CDN APIs; develop the prototype locally against its published package files.

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

Proposed API, with `<release>` replaced by an exact published package version containing
the new helper. This example will not work against the upgrade-only `2.0.0-alpha.0`:

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

Provide `getStableCdnImportMap` for consumers that own their document bootstrap. It returns
a standard `{ imports, scopes }` map, with integrity metadata only where supported and
verified. This path permits normal bare imports such as:

```js
import { jsx } from '@knighted/jsx'
import { reactJsx } from '@knighted/jsx/react'
```

Document how to embed the generated map inline before importing runtime modules. Native
external `<script type="importmap" src="...">` is not a supported installation pattern.
Offer a generated inline HTML snippet; do not require consumers to assemble dependency
URLs manually or install a generator merely to use the package.

### Existing applications and peers

- Accept explicit existing peer mappings, particularly React and React DOM. Validate
  supported versions and route all relevant imports to one canonical React URL.
- Default to a tested exact React/React DOM pair when the consumer supplies neither.
- Use scopes for legitimate dependency-version coexistence, not duplicate React instances
  within the same application tree.
- Detect visible mapping conflicts and reject incompatible repeated loader calls.
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

Use a proven dependency/import-map generator where feasible. Evaluate `@jspm/generator`
first, but do not assume its provider can resolve `@knighted/jsx` or OXC bindings: earlier
workspace experiments encountered provider resolution failures. If it cannot satisfy the
requirements, evaluate a different generator/provider before designing a custom resolver.

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

1. **Prove feasibility.** After the user publishes `2.0.0-alpha.0`, verify its package and
   CDN files are available and generate a complete map for that exact release. Run DOM
   parsing, React hooks, and browser TypeScript/JSX transformation in Chromium. Inspect all
   loaded module and WASM URLs. Prove that no mutable dependency edge is hidden or
   uncontrolled. Stop and reassess the provider if this cannot be demonstrated without a
   vendor bundle.
2. **Implement the frozen manifest.** Reuse the contract generator's home, add explicit
   update/check modes and schema validation, and publish the verified map/asset records.
   Generate the consumer HTML snippet from that same manifest.
3. **Implement the consumer APIs.** Extend the existing CDN helper module with the loader
   and advanced map API. Keep map installation separate from pure manifest/map computation.
   Add clear errors for unsupported providers, conflicts, invalid manifests, and failed
   fetches. Avoid a custom module loader or legacy-browser polyfills.
4. **Adopt in the demo.** Replace handwritten dependency patches and mismatched preloads
   with the new bootstrap. Keep the existing demo design unchanged. Ensure startup failures
   replace the loading state with an actionable error rather than leaving a spinner.
5. **Release and document.** Test package artifacts and release-specific CDN paths, update
   installation examples, and document peer composition and import-map ordering. Separate
   pre-publication artifact checks from post-publication live-CDN verification.

New generator dependencies, publishing/build changes, and public API changes require
approval before implementation under the repository's existing boundaries.

## Verification and acceptance

- Unit tests cover manifest validation, graph completeness, deterministic serialization,
  scopes, peer identity, map conflicts, loader idempotence, and error handling.
- Browser tests cover DOM, React hooks, combined DOM/React use, JSX/TypeScript
  transformation, repeated entry loads, existing host maps, and isolated documents.
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

Use a major release if we remove the old helper, change its return contract/defaults, or
make existing supported workflows require import-map installation. A v2 may provide a
cleaner unified API, but versioning alone does not fix dependency resolution.

Confirm the final stable release's API and migration requirements after the feasibility
milestone and a consumer compatibility check. The v2 prerelease testing path does not
require removing the existing APIs or combining the dependency upgrade and CDN work
into one commit.
