# Developer Experience Next Steps

A few focused improvements will give @knighted/jsx a more polished, batteries-included feel across editors, runtimes, and testing workflows.

1. **Type-level ergonomics** – Explore opt-in helpers like `jsx.el<'button'>` (or richer intrinsic maps) so DOM nodes return concrete element types, and tighten the React intrinsic typing to match native attributes. Document how these helpers compose with existing components so the DX stays predictable.
2. **Starter templates** – Ship StackBlitz/CodeSandbox starters (DOM-only, React, Lit + React) that highlight CDN flows and bundler builds. Link them in the README/docs so developers can experiment without cloning the repo.
3. **Runtime diagnostics** – Add an optional dev flag that surfaces friendly warnings for common pitfalls (missing `key`, fragment reuse, string refs, etc.) to shorten debugging cycles without bloating production bundles.
4. **Bundle-size trims** – Audit shared helpers/metadata for duplication, experiment with feature flags (opt-out of advanced descriptors), and run esbuild/rollup analyzers to find dead code so the next releases can claw back some of the new bytes.
