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
- [Next.js integration](#nextjs-integration)
- [Browser usage](#browser-usage)
- [Testing & demos](#testing)

## Installation

```sh
npm install @knighted/jsx
```

> [!IMPORTANT]
> This package is ESM-only and targets browsers or ESM-aware bundlers. `require()` is not supported; use native `import`/`<script type="module">` and a DOM-like environment.

> [!NOTE]
> Planning to use the React runtime (`@knighted/jsx/react`)? Install `react@>=18` and `react-dom@>=18` alongside this package so the helper can create elements and render them through ReactDOM.

The parser automatically uses native bindings when it runs in Node.js. To enable the WASM binding for browser builds you also need the `@oxc-parser/binding-wasm32-wasi` package. Because npm enforces the `cpu: ["wasm32"]` flag you must opt into the install explicitly:

```sh
npm_config_ignore_platform=true npm install @oxc-parser/binding-wasm32-wasi
```

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
    Count is {${count}}
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
      <p>Count is {${count}}</p>
      <button onClick={${() => setCount(value => value + 1)}}>
        Increment
      </button>
    </section>
  `
}

createRoot(document.getElementById('root')!).render(reactJsx`<${App} />`)
```

The React runtime shares the same template semantics as `jsx`, except it returns React elements (via `React.createElement`) so you can embed other React components with `<${MyComponent} />` and use hooks/state as usual. The helper lives in a separate subpath so DOM-only consumers never pay the React dependency cost.

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
              // Both optional: restrict or rename the tagged templates.
              // tag: 'jsx', // single-tag option
              // tags: ['jsx', 'reactJsx'],
            },
          },
        ],
      },
    ],
  },
}
```

Pair the loader with your existing TypeScript/JSX transpiler (SWC, Babel, Rspack’s builtin loader, etc.) so regular React components and the tagged templates can live side by side. The demo fixture under `test/fixtures/rspack-app` shows a full setup that mixes Lit and React:

```sh
npm run build
npm run setup:wasm
npm run build:fixture
```

Then point a static server at the fixture root (which serves `index.html` plus the bundled `dist/hybrid.js` and `dist/reactMode.js`) to see it in a browser:

```sh
# Serve the rspack fixture from the repo root
npx http-server test/fixtures/rspack-app -p 4173
```

Visit `http://localhost:4173` (or whichever port you pick) to interact with both the Lit + React hybrid demo and the React-mode bundle.

## Node / SSR usage

Import the dedicated Node entry (`@knighted/jsx/node`) when you want to run the template tag inside bare Node.js. It automatically bootstraps a DOM shim by loading either `linkedom` or `jsdom` (install one of them to opt in) and then re-exports the usual helpers so you can keep authoring JSX in the same way:

```ts
import { jsx } from '@knighted/jsx/node'
import { reactJsx } from '@knighted/jsx/node/react'
import { renderToString } from 'react-dom/server'

const Badge = ({ label }: { label: string }) =>
  reactJsx`
    <button type="button">React says: {${label}}</button>
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

## Next.js integration

> [!IMPORTANT]
> Next already compiles `.tsx/.jsx` files, so you do not need this helper to author regular components. The loader only adds value when you want to reuse the tagged template runtime during SSR—mixing DOM nodes built by `jsx` with React markup, rendering shared utilities on the server, or processing tagged templates outside the usual component pipeline.

Next (and Remix/other Webpack-based SSR stacks) can run the loader by adding a post-loader to the framework config so the template tags are rewritten after SWC/Babel transpilation. The fixture under `test/fixtures/next-app` ships a complete example that mixes DOM and React helpers during SSR so you can pre-render DOM snippets (for emails, HTML streams, CMS content, etc.) while still returning React components from your pages. The important bits live in `next.config.mjs`:

```js
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const distDir = path.join(repoRoot, 'dist')

export default {
  output: 'export',
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@knighted/jsx': path.join(distDir, 'index.js'),
      '@knighted/jsx/react': path.join(distDir, 'react/index.js'),
    }

    config.module.rules.push({
      test: /\.[jt]sx?$/,
      include: path.join(__dirname, 'pages'),
      enforce: 'post',
      use: [{ loader: path.join(distDir, 'loader/jsx.js') }],
    })

    return config
  },
}
```

Inside `pages/index.tsx` you can freely mix the helpers. The snippet below uses `jsx` on the server to prebuild a DOM fragment and then injects that HTML alongside a normal React component on the client:

```ts
import type { GetServerSideProps } from 'next'
import { jsx } from '@knighted/jsx'
import { reactJsx } from '@knighted/jsx/react'

const buildDomShell = () =>
  jsx`
    <section data-kind="dom-runtime">
      <h2>DOM runtime</h2>
      <p>Rendered as static HTML on the server</p>
    </section>
  `

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    props: {
      domShell: buildDomShell().outerHTML,
    },
  }
}

const ReactBadge = () =>
  reactJsx`
    <button type="button">React badge</button>
  `

type PageProps = { domShell: string }

export default function Page({ domShell }: PageProps) {
  return reactJsx`
    <main>
      <${ReactBadge} />
      <div dangerouslySetInnerHTML={${{ __html: domShell }}}></div>
    </main>
  `
}
```

Build the fixture locally with `npx next build test/fixtures/next-app` (or run `npx vitest run test/next-fixture.test.ts`) to verify the integration end to end. You can adapt the same pattern in `app/` routes, API handlers, or server actions whenever you need DOM output generated by the tagged template runtime.

### Interpolations

- All dynamic values are provided through standard template literal expressions (`${...}`) and map to JSX exactly where they appear. Wrap the emitted placeholders with JSX braces whenever they render as children (`<p>{${value}}</p>`), because the template builder injects placeholder tokens before parsing. You still use the usual braces for props and spreads (`className={${value}}`, `{...props}`, etc.).
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

const label = 'Tap me'

const view = jsx`
  <section>
    <${Button} variant="ghost">
      {${label}}
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

If you are building locally with Vite/Rollup/Webpack make sure the WASM binding is installable so the bundler can resolve `@oxc-parser/binding-wasm32-wasi` (details below).

### Installing the WASM binding locally

`@oxc-parser/binding-wasm32-wasi` publishes with `"cpu": ["wasm32"]`, so npm/yarn/pnpm skip it on macOS and Linux unless you override the platform guard. Run the helper script after cloning (or whenever you clean `node_modules`) to pull the binding into place for the Vite demo and any other local bundler builds:

```sh
npm run setup:wasm
```

The script downloads the published tarball via `npm pack`, extracts it into `node_modules/@oxc-parser/binding-wasm32-wasi`, and removes the temporary archive so your lockfile stays untouched. If you need to test a different binding build, set `WASM_BINDING_PACKAGE` before running the script (for example, `WASM_BINDING_PACKAGE=@oxc-parser/binding-wasm32-wasi@0.100.0 npm run setup:wasm`).

Prefer the manual route? You can still run `npm_config_ignore_platform=true npm install --no-save @oxc-parser/binding-wasm32-wasi@^0.99.0`, but the script above replicates the vendored behavior with less ceremony.

### Lite bundle entry

If you already run this package through your own bundler you can trim a few extra kilobytes by importing the minified entries:

```ts
import { jsx } from '@knighted/jsx/lite'
import { reactJsx } from '@knighted/jsx/react/lite'
import { jsx as nodeJsx } from '@knighted/jsx/node/lite'
import { reactJsx as nodeReactJsx } from '@knighted/jsx/node/react/lite'
```

Each lite subpath ships the same API as its standard counterpart but is pre-minified and scoped to just that runtime (DOM, React, Node DOM, or Node React). Swap them in when you want the smallest possible bundles; otherwise the default exports keep working as-is.

## Testing

Run the Vitest suite (powered by jsdom) to exercise the DOM runtime and component support:

```sh
npm run test
```

Tests live in `test/jsx.test.ts` and cover DOM props/events, custom components, fragments, and iterable children so you can see exactly how the template tag is meant to be used.

Need full end-to-end coverage? The Playwright suite boots the CDN demo (`examples/esm-demo.html`) and the loader-backed Rspack fixture to verify nested trees, sibling structures, and interop with Lit/React:

```sh
npm run test:e2e
```

> [!NOTE]
> The e2e script builds the library, installs the WASM parser binding, bundles the loader fixture, and then runs `playwright test`. Make sure Playwright browsers are installed locally (`npx playwright install`).

## Browser demo / Vite build

This repo ships with a ready-to-run Vite demo under `examples/browser` that bundles the library (make sure you have installed the WASM binding via the command above first). Use it for a full end-to-end verification in a real browser (the demo imports `@knighted/jsx/lite` so you can confirm the lighter entry behaves identically):

```sh
# Start a dev server at http://localhost:5173
npm run dev

# Produce a production Rollup build and preview it
npm run build:demo
npm run preview
```

For a zero-build verification of the lite bundle, open `examples/esm-demo-lite.html` locally (double-click or run `open examples/esm-demo-lite.html`) or visit the deployed GitHub Pages build produced by `.github/workflows/deploy-demo.yml` (it serves that same lite HTML demo).

## Limitations

- Requires a DOM-like environment (it throws when `document` is missing).
- JSX identifiers are resolved at runtime through template interpolations; you cannot reference closures directly inside the template without using `${...}`.
- Promises/async components are not supported.

## License

MIT © Knighted Code Monkey
