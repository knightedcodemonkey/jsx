---
applyTo: '**'
---

# Pull request review guidance

You are reviewing changes for @knighted/jsx. Be concise, technical, and specific. Prefer actionable feedback tied to concrete lines.

## Focus areas

- **Runtime correctness:** DOM/React node creation, event handling, `class`/`style`, fragments, SVG namespaces, and `dangerouslySetInnerHTML` behavior.
- **Loader correctness:** Tagged template parsing, transform output, sourcemaps, and compatibility with bundlers.
- **Node/SSR:** DOM shim selection (`linkedom`/`jsdom`), SSR output stability, and environment guards.
- **Type safety:** Strict TypeScript, exported types, and no unsafe `any` or unnecessary assertions.
- **Performance:** Avoid unnecessary allocations in hot paths and keep parser usage efficient.
- **Docs/tests alignment:** Behavior changes must update docs and add or adjust tests.

## What to verify

- The change does not modify public API surface without explicit approval.
- No generated artifacts are edited (dist/, coverage/, test-results/).
- New tests cover new behavior; existing tests still make sense.
- Error messages are clear and stable (avoid breaking snapshots).
- ESM-only constraints remain intact.

## Review output format

- Use bullet points for issues and suggestions.
- Mark severity as **blocking**, **important**, or **nit**.
- When suggesting fixes, include the minimal change required.

## Ask for changes when

- Behavior changes without test updates.
- New dependencies are added without approval.
- Build scripts, CI, or publishing config are modified.
- Logic changes are hidden inside formatting-only commits.
