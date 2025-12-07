# Developer Experience Next Steps

A few focused improvements will give @knighted/jsx a more polished, batteries-included feel across editors, runtimes, and testing workflows.

## 1. IDE integration

- Ship a VS Code/Cursor extension that injects grammar scopes for `jsx`/`reactJsx` template tags and optionally bundles a TypeScript language service plugin so IntelliSense recognizes the helpers.
- Document installation in the main README so users can enable highlighting and completions with one click.

## 2. Type-level ergonomics

- Provide opt-in helper wrappers (for example `jsx.el<'button'>`) that return concrete `HTMLElement` types, plus richer React intrinsic typing for `reactJsx` so attribute completion matches native elements.
- Clearly explain how to mix these helpers with existing components to keep type safety predictable across DOM and React runtimes.

## 3. Starter templates

- Publish StackBlitz/CodeSandbox starters (DOM only, React, Lit + React) and link them from the docs so newcomers can experiment without cloning the repo.
- Include scripts that demonstrate the CDN-only workflow alongside bundler-driven builds.

## 4. Runtime diagnostics

- Add a development flag that logs friendly warnings for common pitfalls (missing `key`, passing plain strings instead of nodes, etc.) to shorten the feedback loop while prototyping.

## 5. Documentation polish

- Introduce a "Recipes" or "Playbook" section covering SSR, email rendering, CMS ingestion, and hybrid Lit/React shells, with deep links from the README.
- Highlight the new IDE tooling and typed helpers so users discover them naturally.

## 6. Testing utilities

- Publish lightweight test helpers (DOM snapshot assertions, JSX rendering helpers for Vitest/Jest) so teams can validate components without hand-rolling boilerplate each time.

Track these items in issues/milestones so the community can follow along and contribute where it matters most.
