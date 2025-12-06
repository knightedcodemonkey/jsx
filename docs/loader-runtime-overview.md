# Loader and Runtime Overview

This document explains how the `@knighted/jsx` loader cooperates with the runtime helpers (`jsx` and `reactJsx`). Use it to reason about what happens between authoring a tagged template literal and seeing it render inside a browser or Node environment.

## End-to-end flow

1. **Authoring** – you write JSX inside a tagged template literal (for example `jsx` or `reactJsx`).
2. **Loader pass (optional)** – when bundling with Webpack/Rspack/Next/etc., the loader parses the template, fixes up JSX semantics, and emits normal JavaScript. Two transformation modes are available:
   - `runtime` (default) – keeps the tagged template and lets the runtime evaluate it later.
   - `react` – replaces the tagged template with `React.createElement` calls (via helper shims) so the runtime never touches the template.
3. **Runtime evaluation** – at execution time the template tag function receives the raw `strings`/`values` arrays from JavaScript and turns the JSX tree into DOM nodes (for `jsx`) or React elements (for `reactJsx`).

## Default `runtime` mode example

Source template:

```ts
const Button = props => jsx`<button {...${props}} />`

const view = jsx`
  <${Button} kind={${variant}}>
    click me
  </${Button}>
`
```

What the loader does:

- Every dynamic tag (`<${Button}>`) is temporarily replaced with a placeholder such as `__JSX_LOADER_TAG_EXPR_0__` so the embedded JSX parser can treat the template as valid static markup.
- Each placeholder is recorded inside a `placeholderMap` so the loader knows the original source expression (`Button` in this case).
- After the template is re-rendered with proper JSX semantics (attribute braces, trimmed whitespace, etc.), the loader restores the original `${Button}` expressions. The compiled bundle still contains a tagged template literal.

Runtime view:

- When the bundle runs, JavaScript evaluates the template literal and hands the `strings`/`values` pairs to the `jsx` helper.
- One of the `values` entries is the `Button` reference. Because the loader tracked where the tag lived inside the template, the runtime knows that the `Button` value belongs in the tag position and renders it as a component (identical to how React tagged templates would behave).
- No `__JSX_LOADER_*` markers survive past the loader pass—they are purely an internal implementation detail.

## React mode example

Sometimes you want the loader to emit plain React elements so your bundle never ships the runtime JSX interpreter. Configure this globally or per-tag:

```js
// rspack.config.js (excerpt)
{
  loader: '@knighted/jsx/loader',
  options: {
    mode: 'react',
    tagModes: {
      jsx: 'runtime',      // keep DOM helpers for jsx``
      reactJsx: 'react',   // compile reactJsx`` to createElement calls
    },
  },
}
```

Given:

```ts
const heading = reactJsx`
  <${Title}>React-ready</${Title}>
`
```

The loader parses the template, preserves placeholders for the dynamic tag, and immediately converts the AST into helper calls such as:

```ts
const heading = __jsxReact(Title, null, 'React-ready')
const __jsxReactMergeProps = (...sources) => Object.assign({}, ...sources)
const __jsxReact = (type, props, ...children) =>
  React.createElement(type, props, ...children)
```

Because the output is already `React.createElement`-compatible, React can render it without involving the runtime `reactJsx` helper.

## Placeholder lifecycle

| Stage                     | What exists                         | Notes                                                                                         |
| ------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Source                    | `<${Button}>`                       | Plain template literal expressions.                                                           |
| Loader parsing            | `<__JSX_LOADER_TAG_EXPR_0__>`       | Placeholder markers let the JSX parser treat tags as identifiers. Stored in `placeholderMap`. |
| Loader output (`runtime`) | `<${Button}>`                       | Placeholders restored before emitting code.                                                   |
| Loader output (`react`)   | `__jsxReact(Button, ...)`           | Placeholder map is resolved into helper arguments instead of restoring the template literal.  |
| Runtime execution         | receives `values[index] === Button` | JS engine already evaluated expressions; runtime helper simply sees the function reference.   |

## Working with Lit and other hosts

When embedding React components inside Lit (or any framework that expects DOM nodes), keep using a dedicated host element:

1. Lit renders `<div class="react-host"></div>`.
2. React’s `createRoot` targets that node and renders the tree built from `reactJsx` (or the loader-emitted helper calls).
3. The loader mode you choose only affects how the React tree is constructed; it does not change the fact that React still mounts into Lit via a host element.

## Choosing between modes

- Stick with `runtime` when you need the tagged template to produce DOM nodes at execution time (browser scripts, Lit components, SSR DOM shims, etc.).
- Use `react` when your tagged template should behave like authored JSX inside React components. This avoids shipping the runtime interpreter and eliminates placeholder artifacts entirely.
- Mix and match with `tagModes` to migrate incrementally: e.g., lit templates keep `runtime` while `reactJsx` tags compile to React helpers.

Having this mental model handy makes debugging much easier: if something odd appears in your bundle, remember whether you expect to see a tagged template literal (runtime mode) or `React.createElement` calls (react mode).
