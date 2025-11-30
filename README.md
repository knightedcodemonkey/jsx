# [`@knighted/jsx`](https://www.npmjs.com/package/@knighted/jsx)

![CI](https://github.com/knightedcodemonkey/jsx/actions/workflows/ci.yml/badge.svg)
[![codecov](https://codecov.io/gh/knightedcodemonkey/jsx/graph/badge.svg?token=tjxuFwcwkr)](https://codecov.io/gh/knightedcodemonkey/jsx)
[![NPM version](https://img.shields.io/npm/v/@knighted/jsx.svg)](https://www.npmjs.com/package/@knighted/jsx)

A runtime JSX template tag backed by the [`oxc-parser`](https://github.com/oxc-project/oxc) WebAssembly build. Use real JSX syntax directly inside template literals and turn the result into live DOM nodes (or values returned from your own components) without running a bundler.

## Installation

```sh
npm install @knighted/jsx
```

> [!IMPORTANT]
> This package is ESM-only and targets browsers or ESM-aware bundlers. `require()` is not supported; use native `import`/`<script type="module">` and a DOM-like environment.

The parser automatically uses native bindings when it runs in Node.js. To enable the WASM binding for browser builds you also need the `@oxc-parser/binding-wasm32-wasi` package. Because npm enforces the `cpu: ["wasm32"]` flag you must opt into the install explicitly:

```sh
npm_config_ignore_platform=true npm install @oxc-parser/binding-wasm32-wasi
```

> Tip: public CDNs such as `esm.sh` or `jsdelivr` already publish bundles that include the WASM binding, so you can import this package directly from those endpoints in `<script type="module">` blocks without any extra setup.

## Usage

```ts
import { jsx } from '@knighted/jsx'

const count = 3
const handleClick = () => console.log('clicked!')

const button = jsx`
  <button className={${`counter-${count}`}} onClick={${handleClick}}>
    Count is {${count}}
  </button>
`

document.body.append(button)
```

### Interpolations

- All dynamic values are provided through standard template literal expressions (`${...}`). Wrap them in JSX braces to keep the syntax valid: `className={${value}}`, `{${items}}`, etc.
- Every expression can be any JavaScript value: primitives, arrays/iterables, DOM nodes, functions, other `jsx` results, or custom component references.
- Async values (Promises) are not supported. Resolve them before passing into the template.

### Components

You can inline components by interpolating the function used for the tag name. The component receives a props object plus the optional `children` prop and can return anything that `jsx` can render (DOM nodes, strings, fragments, other arrays, ...).

```ts
const Button = ({ children, variant = 'primary' }) => {
  const el = document.createElement('button')
  el.dataset.variant = variant
  el.append(children ?? '')
  return el
}

const view = jsx`
  <section>
    <${Button} variant={${'ghost'}}>
      {${'Tap me'}}
    </${Button}>
  </section>
`

document.body.append(view)
```

### Fragments & SVG

Use JSX fragments (`<>...</>`) for multi-root templates. SVG trees automatically switch to the `http://www.w3.org/2000/svg` namespace once they enter an `<svg>` tag, and fall back inside `<foreignObject>`.

### DOM-specific props

- `style` accepts either a string or an object. Object values handle CSS custom properties (`--token`) automatically.
- `class` and `className` both work and can be strings or arrays.
- Event handlers use the `on<Event>` naming convention (e.g. `onClick`).
- `ref` supports callback refs as well as mutable `{ current }` objects.
- `dangerouslySetInnerHTML` expects an object with an `__html` field, mirroring React.

## Browser usage

When you are not using a bundler, load the module directly from a CDN that understands npm packages:

```html
<script type="module">
  import { jsx } from 'https://esm.sh/@knighted/jsx'

  const message = jsx`<p>Hello from the browser</p>`
  document.body.append(message)
</script>
```

If you are building locally with Vite/Rollup/Webpack make sure the WASM binding is installable (see the `npm_config_ignore_platform` tip above) so the bundler can resolve `@oxc-parser/binding-wasm32-wasi`.

### Lite bundle entry

If you already run this package through your own bundler you can trim a few extra kilobytes by importing the minified entry:

```ts
import { jsx } from '@knighted/jsx/lite'
```

The `lite` export ships the exact same API as the default entry but is pre-minified via `tsup`, so bundlers have less work to do and browsers download ~10% less code. No functionality is removed—you can freely swap between the standard and lite imports.

## Testing

Run the Vitest suite (powered by jsdom) to exercise the DOM runtime and component support:

```sh
npm run test
```

Tests live in `test/jsx.test.ts` and cover DOM props/events, custom components, fragments, and iterable children so you can see exactly how the template tag is meant to be used.

## Browser demo / Vite build

This repo ships with a ready-to-run Vite demo under `examples/browser` that bundles the library (and the WASM binding vendored in `vendor/binding-wasm32-wasi`). Use it for a full end-to-end verification in a real browser (the demo now imports `@knighted/jsx/lite` so you can confirm the lighter entry behaves identically):

```sh
# Start a dev server at http://localhost:5173
npm run dev

# Produce a production Rollup build and preview it
npm run build:demo
npm run preview
```

The Vite config aliases `@oxc-parser/binding-wasm32-wasi` to the vendored copy so you don't have to perform any extra install tricks locally, while production consumers can still rely on the published package. For a zero-build verification of the lite bundle, open `examples/esm-demo-lite.html` locally (double-click or run `open examples/esm-demo-lite.html`) or visit the deployed GitHub Pages build produced by `.github/workflows/deploy-demo.yml` (it serves that same lite HTML demo).

## Limitations

- Requires a DOM-like environment (it throws when `document` is missing).
- JSX identifiers are resolved at runtime through template interpolations; you cannot reference closures directly inside the template without using `${...}`.
- Promises/async components are not supported.

## Performance notes vs `htm`

[`htm`](https://github.com/developit/htm) popularized tagged template literals for view rendering by tokenizing the template strings on the fly and calling a user-provided hyperscript function. This library takes a different approach: every invocation runs the native `oxc-parser` (compiled to WebAssembly) to build a real JSX AST before constructing DOM nodes.

Tradeoffs to keep in mind:

- **Parser vs tokenizer** – `htm` performs lightweight string tokenization, while `@knighted/jsx` pays a higher one-time parse cost but gains the full JSX grammar (fragments, spread children, nested namespaces) without heuristics. For large or deeply nested templates the WASM-backed parser is typically faster and more accurate than string slicing.
- **DOM-first rendering** – this runtime builds DOM nodes directly, so the cost after parsing is mostly attribute assignment and child insertion. `htm` usually feeds a virtual DOM/hyperscript factory (e.g., Preact’s `h`), which may add an extra abstraction layer before hitting the DOM.
- **Bundle size** – including the parser and WASM binding is heavier than `htm`’s ~1 kB tokenizer. If you just need hyperscript sugar, `htm` stays leaner; if you value real JSX semantics without a build step, the extra kilobytes buy you correctness and speed on complex trees.
  - **Actual size** – the default `dist/jsx.js` bundle is ~13.9 kB raw / ~3.6 kB min+gzip, while the new `@knighted/jsx/lite` entry is ~5.7 kB raw / ~2.5 kB min+gzip. `htm` weighs in at roughly 0.7 kB min+gzip, so the lite entry narrows the gap to ~1.8 kB for production payloads.

In short, `@knighted/jsx` trades a slightly larger runtime for the ability to parse genuine JSX with native performance, whereas `htm` favors minimal footprint and hyperscript integration. Pick the tool that aligns with your rendering stack and performance envelope.

## License

MIT © Knighted Code Monkey
