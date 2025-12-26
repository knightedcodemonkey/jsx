# Developer Experience Next Steps

A few focused improvements will give @knighted/jsx a more polished, batteries-included feel across editors, runtimes, and testing workflows.

1. **Type-level ergonomics** – Explore opt-in helpers like `jsx.el<'button'>` (or richer intrinsic maps) so DOM nodes return concrete element types, and tighten the React intrinsic typing to match native attributes. Document how these helpers compose with existing components so the DX stays predictable.
2. **Starter templates** – Ship StackBlitz/CodeSandbox starters (DOM-only, React, Lit + React) that highlight CDN flows and bundler builds. Link them in the README/docs so developers can experiment without cloning the repo.
3. **Diagnostics UX polish** – Build on the new `enableJsxDebugDiagnostics` helper by surfacing template codeframes, component names, and actionable remediation steps. Ship CLI toggles / README callouts so CDN demos and starters enable debug mode automatically in development while keeping production bundles pristine.
4. **Bundle-size trims** – With debug helpers moved to opt-in paths, refocus on analyzer-driven trims (property-information lookups, node bootstrap reuse, shared helper chunks). Validate the new floor across lite + standard builds with `npm run sizecheck` and document any remaining hotspots so future releases keep shrinking.
