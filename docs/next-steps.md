# Developer Experience Next Steps

A few focused improvements will give @knighted/jsx a more polished, batteries-included feel across editors, runtimes, and testing workflows.

## 1. Type-level ergonomics

- Provide opt-in helper wrappers (for example `jsx.el<'button'>`) that return concrete `HTMLElement` types, plus richer React intrinsic typing for `reactJsx` so attribute completion matches native elements.
- Clearly explain how to mix these helpers with existing components to keep type safety predictable across DOM and React runtimes.

## 2. Starter templates

- Publish StackBlitz/CodeSandbox starters (DOM only, React, Lit + React) and link them from the docs so newcomers can experiment without cloning the repo.
- Include scripts that demonstrate the CDN-only workflow alongside bundler-driven builds.

## 3. Runtime diagnostics

- Add a development flag that logs friendly warnings for common pitfalls (missing `key`, passing plain strings instead of nodes, etc.) to shorten the feedback loop while prototyping.
