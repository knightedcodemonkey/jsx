# TypeScript Plugin Support

Use the [`@knighted/jsx-ts-plugin`](https://github.com/knightedcodemonkey/jsx-ts-plugin) to teach both the TypeScript language service and `tsc --noEmit` how to interpret `@knighted/jsx` tagged templates. The plugin understands the DOM (`jsx`) and React (`reactJsx`) entrypoints, applies mode-aware diagnostics, and forwards the same rules to the compiler so command-line builds match what your editor reports.

## Installation

```sh
npm install --save-dev @knighted/jsx-ts-plugin
```

## Configuration

Enable the plugin inside the `plugins` section of your `tsconfig.json` (or `jsconfig.json`). Mixed DOM + React projects only need a single plugin block—the plugin routes each tag to the right mode automatically.

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@knighted/jsx-ts-plugin",
        "tagModes": {
          "jsx": "dom",
          "reactJsx": "react"
        }
      }
    ]
  }
}
```

> [!TIP]
> The `tagModes` entry shown above matches the built-in defaults. Keep it when you add custom tag names (for example, if you alias `jsx` to `html`), otherwise you can omit the property entirely.

Restart your editor after saving the config. From VS Code you can run **TypeScript: Select TypeScript Version** → **Use Workspace Version** to make sure the plugin loads from `node_modules`. The plugin repository documents every option and includes advanced examples—see [knightedcodemonkey/jsx-ts-plugin](https://github.com/knightedcodemonkey/jsx-ts-plugin) for details.

## Mixed DOM + React diagnostics

- `jsx` templates run in **DOM mode** (accepting DOM nodes, strings, iterables, etc.).
- `reactJsx` templates run in **React mode** (accepting `ReactNode`, hooks, and JSX component types).
- `tsc --noEmit` and `tsserver` share the same diagnostics, so CI sees the exact errors you see inside your editor.

You can override the mode per expression by dropping an inline directive immediately before the template literal:

```ts
/* @jsx-dom */ const card = jsx`<section>${value}</section>`
/* @jsx-react */ const element = jsx`<${ReactComponent} />`
```

The directive applies only to the next tagged template, making it safe to mix DOM wrappers and React islands inside the same file without global config churn.

## Helpful types

The runtime exports the `JsxRenderable` helper so DOM templates never have to cast through `ReactNode`. Use it when you surface values from pure functions or external libraries:

```ts
import type { JsxRenderable } from '@knighted/jsx'

const asRenderable = (input: unknown): JsxRenderable => {
  if (input instanceof Node) return input
  return String(input ?? '')
}

const view = jsx`<span>${asRenderable(payload)}</span>`
```

React mode continues to rely on `ReactNode`, so projects that import both helpers can keep using the standard React types.

## Editor checklist

1. Install `@knighted/jsx-ts-plugin` as a dev dependency.
2. Add a single plugin block in `tsconfig.json` (as shown above) or extend it with additional `tagModes` for custom tags.
3. Restart your editor and point VS Code at the workspace TypeScript version so the plugin loads.
4. Run `tsc --noEmit` in CI to surface the same diagnostics the editor shows.

Following the checklist keeps DOM and React templates aligned across the entire toolchain—no ReactNode casts, no mismatched compiler results, and no duplicate plugin entries.
