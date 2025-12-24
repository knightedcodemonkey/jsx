# [`@knighted/jsx`](https://www.npmjs.com/package/@knighted/jsx)

![CI](https://github.com/knightedcodemonkey/jsx/actions/workflows/ci.yml/badge.svg)
[![codecov](https://codecov.io/gh/knightedcodemonkey/jsx/graph/badge.svg?token=tjxuFwcwkr)](https://codecov.io/gh/knightedcodemonkey/jsx)
[![NPM version](https://img.shields.io/npm/v/@knighted/jsx.svg)](https://www.npmjs.com/package/@knighted/jsx)

A runtime JSX template tag backed by the [`oxc-parser`](https://github.com/oxc-project/oxc) WebAssembly build. Use real JSX syntax directly inside template literals and turn the result into live DOM nodes (or values returned from your own components) without running a bundler. One syntax works everywhere—browser scripts, SSR utilities, and bundler pipelines—no separate transpilation step required.

## Key features

- **Parse true JSX with no build step** – template literals go through `oxc-parser`, so fragments, spreads, and SVG namespaces all work as expected.
- **DOM + React runtimes** – choose `jsx` for DOM nodes or `reactJsx` for React elements, and mix them freely (even on the server).
- **Loader + SSR support** – ship tagged templates through Webpack/Rspack, Next.js, or plain Node by using the loader and the `@knighted/jsx/node` entry.

## Quick links

- [Usage](#usage)
- [React runtime](#react-runtime-reactjsx)
- [Loader integration](#loader-integration)
- [Node / SSR usage](#node--ssr-usage)
- [Browser usage](#browser-usage)
- [TypeScript plugin](docs/ts-plugin.md)
- [TypeScript guide](docs/typescript.md)
- [Component testing](docs/testing.md)
- [CLI setup](docs/cli.md)

## Installation

```sh
npm install @knighted/jsx
```

> [!IMPORTANT]
> `@knighted/jsx` ships as ESM-only. The dual-mode `.cjs` artifacts we build internally are not published.

> [!NOTE]
> Planning to use the React runtime (`@knighted/jsx/react`)? Install `react@>=18` and `react-dom@>=18` alongside this package so the helper can create elements and render them through ReactDOM.

The parser automatically uses native bindings when it runs in Node.js. To enable the WASM binding for browser builds you also need the `@oxc-parser/binding-wasm32-wasi` package. The quickest path is:

```sh
npx @knighted/jsx init
```

See [docs/cli.md](docs/cli.md) for flags, dry runs, and package-manager overrides. If you prefer manual install, run `npm_config_ignore_platform=true npm install @oxc-parser/binding-wasm32-wasi`.

> [!TIP]
> Public CDNs such as `esm.sh` or `jsdelivr` already publish bundles that include the WASM binding, so you can import this package directly from those endpoints in `<script type="module">` blocks without any extra setup.

## Usage

```ts
import { jsx } from '@knighted/jsx'

let count = 3
const handleClick = () => {
  count += 1
  console.log(`Count is now ${count}`)
}

const button = jsx`
  <button className={${`counter-${count}`}} onClick={${handleClick}}>
    Count is ${count}
  </button>
`

document.body.append(button)
```

### React runtime (`reactJsx`)

Need to compose React elements instead of DOM nodes? Import the dedicated helper from the `@knighted/jsx/react` subpath (React 18+ and `react-dom` are still required to mount the tree):

```ts
import { useState } from 'react'
import { reactJsx } from '@knighted/jsx/react'
import { createRoot } from 'react-dom/client'

const App = () => {
  const [count, setCount] = useState(0)

  return reactJsx`
    <section className="react-demo">
      <h2>Hello from React</h2>
      <p>Count is ${count}</p>
      <button onClick={${() => setCount(value => value + 1)}}>
        Increment
      </button>
    </section>
  `
}

createRoot(document.getElementById('root')!).render(reactJsx`<${App} />`)
```

The React runtime shares the same template semantics as `jsx`, except it returns React elements (via `React.createElement`) so you can embed other React components with `<${MyComponent} />` and use hooks/state as usual. The helper lives in a separate subpath so DOM-only consumers never pay the React dependency cost.

### DOM-specific props

- `style` accepts either a string or an object. Object values handle CSS custom properties (`--token`) automatically.
- `class` and `className` both work and can be strings or arrays.
- Event handlers use the `on<Event>` naming convention (e.g. `onClick`), support capture-phase variants via `on<Event>Capture`, and allow custom events with the `on:custom-event` syntax (descriptor objects with `{ handler, once, capture }` are also accepted).
- `ref` supports callback refs as well as mutable `{ current }` objects.
- `dangerouslySetInnerHTML` expects an object with an `__html` field, mirroring React.

### Fragments & SVG

Use JSX fragments (`<>...</>`) for multi-root templates. SVG trees automatically switch to the `http://www.w3.org/2000/svg` namespace once they enter an `<svg>` tag, and fall back inside `<foreignObject>`.

### Interpolations and components

- `${...}` works exactly like JSX braces: drop expressions anywhere (text, attributes, spreads, conditionals) and the runtime keeps the original syntax. Text nodes do not need extra wrapping—`Count is ${value}` already works.
- Interpolated values can be primitives, DOM nodes, arrays/iterables, other `jsx` trees, or component functions. Resolve Promises before passing them in.
- Inline components are just functions/classes you interpolate as the tag name; they receive props plus optional `children` and can return anything `jsx` accepts.

```ts
const Button = ({ variant = 'primary' }) => {
  let count = 3

  return jsx`
    <button
      data-variant=${variant}
      onClick=${() => {
        count += 1
        console.log(`Count is now ${count}`)
      }}
    >
      Count is ${count}
    </button>
  `
}

const view = jsx`
  <section>
    <p>Inline components can manage their own state.</p>
    <${Button} variant="ghost" />
  </section>
`

document.body.append(view)
```

## Loader integration

Use the published loader entry (`@knighted/jsx/loader`) when you want your bundler to rewrite tagged template literals at build time. The loader finds every ` jsx`` ` (and, by default, ` reactJsx`` ` ) invocation, rebuilds the template with real JSX semantics, and hands back transformed source that can run in any environment.

```js
// rspack.config.js / webpack.config.js
export default {
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        include: path.resolve(__dirname, 'src'),
        use: [
          {
            loader: '@knighted/jsx/loader',
            options: {
              // Optional: restrict or rename the tagged templates.
              // tags: ['jsx', 'reactJsx'],
            },
          },
        ],
      },
    ],
  },
}
```

Pair the loader with your existing TypeScript/JSX transpiler (SWC, Babel, Rspack’s builtin loader, etc.) so regular React components and the tagged templates can live side by side.

Need a deeper dive into loader behavior and options? Check out [`src/loader/README.md`](src/loader/README.md). There is also a standalone walkthrough at [morganney/jsx-loader-demo](https://github.com/morganney/jsx-loader-demo).

## Node / SSR usage

Import the dedicated Node entry (`@knighted/jsx/node`) when you want to run the template tag inside bare Node.js. It automatically bootstraps a DOM shim by loading either `linkedom` or `jsdom` (install one of them to opt in) and then re-exports the usual helpers so you can keep authoring JSX in the same way:

```ts
import { jsx } from '@knighted/jsx/node'
import { reactJsx } from '@knighted/jsx/node/react'
import { renderToString } from 'react-dom/server'

const Badge = ({ label }: { label: string }) =>
  reactJsx`
    <button type="button">React says: ${label}</button>
  `

const reactMarkup = renderToString(
  reactJsx`
    <${Badge} label="Server-only" />
  `,
)

const shell = jsx`
  <main>
    <section dangerouslySetInnerHTML={${{ __html: reactMarkup }}}></section>
  </main>
`

console.log(shell.outerHTML)
```

> [!NOTE]
> The Node entry tries `linkedom` first and falls back to `jsdom`. Install whichever shim you prefer (both are optional peer dependencies) and, if needed, set `KNIGHTED_JSX_NODE_SHIM=jsdom` or `linkedom` to force a specific one.

This repository ships a ready-to-run fixture under `test/fixtures/node-ssr` that uses the Node entry to render a Lit shell plus a React subtree through `ReactDOMServer.renderToString`. Run `npm run build` once to emit `dist/`, then execute `npm run demo:node-ssr` to log the generated markup.

See how to [integrate with Next.js](./docs/nextjs-integration.md).

## TypeScript integration

The [`@knighted/jsx-ts-plugin`](docs/ts-plugin.md) keeps DOM (`jsx`) and React (`reactJsx`) templates type-safe with a single config block. The plugin maps each helper to the right mode by default, so you can mix DOM nodes and React components in the same file without juggling multiple plugin entries.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@knighted/jsx-ts-plugin",
        "tagModes": {
          "jsx": "dom",
          "reactJsx": "react",
        },
      },
    ],
  },
}
```

- Choose **TypeScript: Select TypeScript Version → Use Workspace Version** in VS Code so the plugin loads from `node_modules`.
- Run `tsc --noEmit` (or your build step) to surface the same diagnostics your editor shows.
- Set `jsxImportSource` to `@knighted/jsx` when compiling `.tsx` helpers. The package publishes the `@knighted/jsx/jsx-runtime` module TypeScript expects. The runtime export exists solely for diagnostics and will throw if you call it at execution time—switch back to tagged templates before shipping code.
- Drop `/* @jsx-dom */` or `/* @jsx-react */` immediately before a tagged template when you need a one-off override.
- Import the `JsxRenderable` helper type from `@knighted/jsx` whenever you annotate DOM-facing utilities without the plugin:

  ```ts
  import type { JsxRenderable } from '@knighted/jsx'

  const coerceToDom = (value: unknown): JsxRenderable => value ?? ''
  const view = jsx`<section>${coerceToDom(data)}</section>`
  ```

> [!TIP]
> Full `tsconfig` examples (single config or split React + DOM helper projects) live in [docs/typescript.md](docs/typescript.md).

Head over to [docs/ts-plugin.md](docs/ts-plugin.md) for deeper guidance, advanced options, and troubleshooting tips.

## Browser usage

When you are not using a bundler, load the module directly from a CDN that understands npm packages:

```html
<script type="module">
  import { jsx } from 'https://esm.sh/@knighted/jsx'
  import { reactJsx } from 'https://esm.sh/@knighted/jsx/react'
  import { useState } from 'https://esm.sh/react@19'
  import { createRoot } from 'https://esm.sh/react-dom@19/client'

  const reactMount = jsx`<div data-kind="react-mount" />`

  const CounterButton = () => {
    const [count, setCount] = useState(0)
    return reactJsx`
      <button type="button" onClick={${() => setCount(value => value + 1)}}>
        Count is ${count}
      </button>
    `
  }

  document.body.append(reactMount)
  createRoot(reactMount).render(reactJsx`<${CounterButton} />`)
</script>
```

### Lite bundle entry

If you already run this package through your own bundler you can trim a few extra kilobytes by importing the minified entries:

```ts
import { jsx } from '@knighted/jsx/lite'
import { reactJsx } from '@knighted/jsx/react/lite'
import { jsx as nodeJsx } from '@knighted/jsx/node/lite'
import { reactJsx as nodeReactJsx } from '@knighted/jsx/node/react/lite'
```

Each lite subpath ships the same API as its standard counterpart but is pre-minified and scoped to just that runtime (DOM, React, Node DOM, or Node React). Swap them in when you want the smallest possible bundles; otherwise the default exports keep working as-is.

## Limitations

- Requires a DOM-like environment (it throws when `document` is missing).
- JSX identifiers are resolved at runtime through template interpolations; you cannot reference closures directly inside the template without using `${...}`.
- Promises/async components are not supported.

## License

MIT © Knighted Code Monkey
