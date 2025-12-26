# TypeScript Plugin Support

Use the [`@knighted/jsx-ts-plugin`](https://github.com/knightedcodemonkey/jsx-ts-plugin) to teach the TypeScript language service how to interpret `@knighted/jsx` tagged templates. The plugin understands the DOM (`jsx`) and React (`reactJsx`) entrypoints and applies mode-aware diagnostics so editors surface real JSX errors inside template literals.

> [!IMPORTANT]
> TypeScript only loads language-service plugins inside editors (via `tsserver`). Running `tsc` or `tsc --noEmit` directly will **not** execute this plugin. To enforce the same diagnostics in CI, pair your build with a compiler transform (loader, `ts-patch`, etc.) or run a custom check that reuses the plugin’s transformation logic.
>
> Requires TypeScript 5.4 or newer (matching the v0.3.x peer dependency in `@knighted/jsx-ts-plugin`).

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

### Options reference

- `tagModes`: maps each tagged template function to either `"dom"` or `"react"`. Defaults to `{ "jsx": "dom", "reactJsx": "react" }` so mixed projects work with zero config.
- `tags` / `mode`: legacy aliases from early releases. They continue to work but `tagModes` is preferred because it supports multiple identifiers at once.
- `maxTemplatesPerFile`: optional safeguard that skips files containing more tagged templates than the provided number—handy if you have giant fixtures that would otherwise slow down the language service.

Restart your editor after saving the config. From VS Code you can run **TypeScript: Select TypeScript Version** → **Use Workspace Version** to make sure the plugin loads from `node_modules`. The plugin repository documents every option and includes advanced examples—see [knightedcodemonkey/jsx-ts-plugin](https://github.com/knightedcodemonkey/jsx-ts-plugin) for details.

## Mixed DOM + React diagnostics

- `jsx` templates run in **DOM mode** (accepting DOM nodes, strings, iterables, etc.).
- `reactJsx` templates run in **React mode** (accepting `ReactNode`, hooks, and JSX component types).

Editors surface the extra diagnostics immediately because the plugin runs inside `tsserver`. Command-line builds still rely on whichever compiler transform or loader you configure outside this plugin.

You can override the mode per expression by dropping an inline directive immediately before the template literal:

```ts
/* @jsx-dom */ const card = jsx`<section>${value}</section>`
/* @jsx-react */ const element = jsx`<${ReactComponent} />`
```

The directive applies only to the next tagged template, making it safe to mix DOM wrappers and React islands inside the same file without global config churn.

Directives can be line or block comments, and they work even when the tag name is custom (for example, if you alias `jsx` to `html`).

## TSX runtime integration

`@knighted/jsx` bundles a `jsx-runtime` entrypoint, so setting `"jsxImportSource": "@knighted/jsx"` gives the TypeScript compiler everything it needs for TSX files.

Remember that DOM-mode helpers return `JsxRenderable` (real DOM nodes, strings, iterables, etc.) while React-mode helpers return `ReactElement`. When sharing utilities between the two ecosystems, let inference pick the right return type and only cast when you truly need DOM-only APIs.

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

### DOM component example

When you build DOM-only helpers (like badges rendered into Lit components), type them with `JsxRenderable` so you never have to cast to `ReactNode`:

```ts
import { jsx } from '@knighted/jsx'
import type { JsxRenderable } from '@knighted/jsx'

type DomBadgeProps = { label: JsxRenderable }

export const DomBadge = ({ label }: DomBadgeProps): HTMLElement => {
  let clicks = 0
  const counterText = jsx`<span>Clicked ${clicks} times</span>` as HTMLSpanElement

  return jsx`
    <article class="dom-badge">
      <header>
        <h2>Lit + DOM with jsx</h2>
        <p data-kind="react">${label}</p>
      </header>
      <button
        type="button"
        data-kind="dom-counter"
        onClick=${() => {
          clicks += 1
          counterText.textContent = `Clicked ${clicks} times`
        }}
      >
        ${counterText}
      </button>
    </article>
  ` as HTMLDivElement
}
```

Here `label` stays fully typed as a DOM-friendly value, and the component returns an `HTMLElement`, so nothing needs to be widened to `ReactNode`.

## Editor checklist

1. Install `@knighted/jsx-ts-plugin` as a dev dependency.
2. Add a single plugin block in `tsconfig.json` (as shown above) or extend it with additional `tagModes` for custom tags.
3. Restart your editor and point VS Code at the workspace TypeScript version so the plugin loads.
4. Pair your CI/build step with the loader or compiler transform you already use for `@knighted/jsx` templates—`tsc --noEmit` alone will not load the language-service plugin.

Following the checklist keeps DOM and React templates aligned across the entire toolchain—no ReactNode casts, no mismatched compiler results, and no duplicate plugin entries.
