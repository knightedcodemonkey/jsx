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

## Testing

Run the Vitest suite (powered by jsdom) to exercise the DOM runtime and component support:

```sh
npm run test
```

Tests live in `test/jsx.test.ts` and cover DOM props/events, custom components, fragments, and iterable children so you can see exactly how the template tag is meant to be used.

## Browser demo / Vite build

This repo ships with a ready-to-run Vite demo under `examples/browser` that bundles the library (and the WASM binding vendored in `vendor/binding-wasm32-wasi`). Use it for a full end-to-end verification in a real browser:

```sh
# Start a dev server at http://localhost:5173
npm run dev

# Produce a production Rollup build and preview it
npm run build:demo
npm run preview
```

The Vite config aliases `@oxc-parser/binding-wasm32-wasi` to the vendored copy so you don’t have to perform any extra install tricks locally, while production consumers can still rely on the published package.

## Limitations

- Requires a DOM-like environment (it throws when `document` is missing).
- JSX identifiers are resolved at runtime through template interpolations; you cannot reference closures directly inside the template without using `${...}`.
- Promises/async components are not supported.

## License

MIT © Knighted Code Monkey
