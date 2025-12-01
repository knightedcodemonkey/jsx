# `@knighted/jsx` Loader

Transform `jsx` tagged template literals in any bundler that supports webpack-style loaders (Rspack, Webpack, etc.). The loader rewrites JSX syntax inside the template into the interpolation-friendly form that `@knighted/jsx` expects, so you can embed JSX snippets anywhere you can use template literals—such as inside Lit components.

## Installation

```sh
npm install @knighted/jsx
```

No extra peer dependency is required; the loader ships with the package.

## Basic usage

Configure your bundler so `.ts`/`.js` files pass through the loader. In Rspack:

`````ts
// rspack.config.ts
import type { Configuration } from '@rspack/core'

````markdown
# `@knighted/jsx` Loader

Transform `jsx` tagged template literals in any bundler that supports webpack-style loaders (Rspack, Webpack, etc.). The loader rewrites JSX syntax inside the template into the interpolation-friendly form that `@knighted/jsx` expects, so you can embed JSX snippets anywhere you can use template literals—such as inside Lit components.

## Installation

```sh
npm install @knighted/jsx
`````

No extra peer dependency is required; the loader ships with the package.

## Basic usage

Configure your bundler so `.ts`/`.js` files pass through the loader. In Rspack:

```ts
// rspack.config.ts
import type { Configuration } from '@rspack/core'

const config: Configuration = {
  module: {
    rules: [
      {
        test: /\.[cm]?[jt]sx?$/,
        use: [
          {
            loader: '@knighted/jsx/loader',
            options: {
              // Optional: rename the tagged template function.
              tag: 'jsx',
            },
          },
        ],
      },
    ],
  },
}

export default config
```

> `tag` defaults to `jsx`. Set it when you wrap the helper (e.g., `const htmlx = jsx`) and want the loader to transform `htmlx`...` instead.

## Writing templates

```ts
import { jsx } from '@knighted/jsx'

const FancyButton = ({ label }) => jsx`<button>{${label}}</button>`

class Widget extends HTMLElement {
  render() {
    return html`
      <div class="card">
        ${jsx`
          <${FancyButton} label={${'Launch'}} />
        `}
      </div>
    `
  }
}
```

During the build the loader rewrites the inner tag:

```ts
${jsx`
  <${FancyButton} label={${'Launch'}} />
`}
```

Your source can stay idiomatic JSX—just remember everything dynamic still lives inside braces (`label={labelText}`) exactly like React. The transformed output feeds `@knighted/jsx` at runtime, which returns DOM nodes you can insert into Lit templates, vanilla DOM APIs, etc.

## Limitations

- Only works on tagged template literals that use the configured `tag`. Regular JSX files still need the usual JSX transformer.
- Template literal `${expr}` segments that sit outside JSX braces are wrapped automatically, so destructured props and children count as “used” without helper code. (You can still write `{expr}` manually if you prefer.)
- Async transforms are not supported; the loader runs synchronously as part of the bundler pipeline.

## Tips

- Pair this loader with Lit by emitting `${jsx`...`}` inside `html``...`` blocks. The Lit template sees a `DocumentFragment`or DOM node returned by`jsx` and inserts it like any other value.
- Use the `lite` entry (`import { jsx } from '@knighted/jsx/lite'`) if you want the smallest runtime inside your bundle—the loader output stays the same.

## End-to-end demo bundle

The repository also ships a complete Rspack + Lit + React example at `test/fixtures/rspack-app/`. The Vitest integration test (`test/loader.e2e.test.ts`) compiles that fixture, stubs the WASM binding, and confirms the loader works inside a real bundler.

To preview it manually:

1. Build the library once (`npm run build`) so the ESM/CJS loader artifacts exist under `dist/`.
2. Ensure the wasm binding is available (`npm run setup:wasm` downloads `@oxc-parser/binding-wasm32-wasi` once). If you deliberately want the no-op stub, pass `-- --use-stub` to the build step later.
3. Run `npm run build:fixture` (writes `test/fixtures/rspack-app/dist/bundle.js` using Rspack and the published loader). Alternatively, execute the e2e test or point Rspack at the fixture entry yourself.
4. Serve the fixture directory (`npx http-server test/fixtures/rspack-app -p 8080 -o` or any static server) and open `http://127.0.0.1:8080/index.html`. It loads `./dist/bundle.js`, registers `<hybrid-element>`, and renders the Lit template that embeds JSX alongside a React-generated badge.

The e2e test normally writes to a temporary directory and deletes it, so you only get a persistent bundle when you explicitly target the fixture’s `dist/` folder. The HTML file is a convenient viewer for manual verification once the bundle exists. If you pass `--use-stub`, the bundle will still run but throws when the parser is invoked—the real wasm binding is required for interactive usage.

```

```
