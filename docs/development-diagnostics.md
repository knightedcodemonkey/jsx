# Development diagnostics

Development-only checks stay completely opt-in so the published bundles remain as small as possible and never assume a Node-style environment. Pick whichever flow matches your tooling.

## Import a debug-flavored helper

Importing the debug entry immediately enables diagnostics while exporting the same `jsx` tag you already use:

- `@knighted/jsx/debug`
- `@knighted/jsx/lite/debug`
- `@knighted/jsx/node/debug`

Use the domain-specific subpath you already rely on (DOM, lite, or Node) and the helper will start issuing warnings in place.

## Programmatically toggle diagnostics

Use the helper functions when you need to opt in conditionally (for example, only during local development):

```ts
import { jsx } from '@knighted/jsx'
import { enableJsxDebugDiagnostics } from '@knighted/jsx/debug-tools'

if (process.env.NODE_ENV !== 'production') {
  enableJsxDebugDiagnostics({ mode: 'env' })
}
```

- `enableJsxDebugDiagnostics({ mode: 'env' })` respects the `KNIGHTED_JSX_DEBUG=1` environment flag.
- `enableJsxDebugDiagnostics({ mode: 'always' })` forces warnings regardless of the environment.
- `disableJsxDebugDiagnostics()` turns everything back off.

The helpers ship from both `@knighted/jsx/debug-tools` and `@knighted/jsx/lite/debug-tools`, so you can stay aligned with whichever runtime entry your bundle consumes.

### About `KNIGHTED_JSX_DEBUG`

The runtime only reads `process.env.KNIGHTED_JSX_DEBUG` when `process` exists, making the default import path safe inside browsers and CDN builds. Set `KNIGHTED_JSX_DEBUG=1` (or use `{ mode: 'always' }`) whenever you want warnings to appear.

## What the diagnostics cover

Once enabled, diagnostics currently:

- Warn when lowercase DOM events such as `onclick` are used instead of the camelCase `onClick` form.
- Throw descriptive errors for invalid event handlers (anything other than a function, `EventListenerObject`, or `{ handler }` descriptor).
- Throw when `dangerouslySetInnerHTML` is provided without a `{ __html: string }` payload.

These checks focus purely on development-time safety nets so production bundles stay lean. Let us know if more cases would be helpful.
