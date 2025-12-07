# `@knighted/jsx` Loader

Transform ` jsx`` ` and ` reactJsx`` ` tagged template literals inside any bundler that supports webpack-style loaders (Rspack, Webpack, etc.). The loader rewrites JSX syntax that lives in template literals so the runtime helpers can execute it later—ideal when you want JSX inside Lit components, custom elements, or shared utilities without adding a `.tsx` transpilation step.

## Installation

```sh
npm install @knighted/jsx
```

The loader ships with the package; no extra peer dependency is required.

## Installing the WASM parser for bundlers

When you run the loader inside a browser-targeted bundle (Rspack/Webpack/Vite/etc.), the parser has to fall back to the WebAssembly build. Install the WASM runtime helpers plus the binding itself so JSX inside template literals can still be parsed:

```sh
# 1. Required runtimes for the WASM binding
npm install -D @napi-rs/wasm-runtime @emnapi/core @emnapi/runtime

# 2. The parser binding ships with "cpu": ["wasm32"],
#    so macOS/Linux users must opt into the install explicitly
npm_config_ignore_platform=true npm install -D @oxc-parser/binding-wasm32-wasi
```

Prefer to skip `npm_config_ignore_platform` in CI? Vendor the binding the same way this repo's `scripts/setup-wasm.mjs` helper does:

```sh
npm pack @oxc-parser/binding-wasm32-wasi@0.101.0
mkdir -p node_modules/@oxc-parser/binding-wasm32-wasi
tar -xzf oxc-parser-binding-wasm32-wasi-0.101.0.tgz \
  -C node_modules/@oxc-parser/binding-wasm32-wasi --strip-components=1
rm oxc-parser-binding-wasm32-wasi-0.101.0.tgz
```

Those commands pull in the binding plus every runtime dependency, keeping the loader operational across macOS arm64, Linux, and browser builds.

## Basic usage

Run your source files through the loader. Example Rspack config:

```ts
// rspack.config.ts
import path from 'node:path'
import type { Configuration } from '@rspack/core'

const config: Configuration = {
  module: {
    rules: [
      {
        test: /\.[cm]?[jt]sx?$/,
        include: path.resolve(__dirname, 'src'),
        use: [
          {
            loader: '@knighted/jsx/loader',
            options: {
              // Customize loader behavior here
            },
          },
        ],
      },
    ],
  },
}

export default config
```

By default the loader transforms both ` jsx`` ` (DOM runtime) and `  reactJsx`` ` (React runtime) calls.

### Loader options

| Option     | Type                                   | Default               | Description                                                                                                 |
| ---------- | -------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `tags`     | `string[]`                             | `['jsx', 'reactJsx']` | Names of tagged template helpers to transform. Add aliases if you re-export the helpers under custom names. |
| `mode`     | `'runtime' \| 'react'`                 | `'runtime'`           | Sets the default transformation target for every tag (`jsx` runtime vs React createElement output).         |
| `tagModes` | `Record<string, 'runtime' \| 'react'>` | `undefined`           | Per-tag override of `mode`. Use this when some tags should emit DOM helpers and others should emit React.   |
| `tag`      | `string`                               | `undefined`           | Legacy single-tag option. Prefer `tags`, but this remains for backward compatibility.                       |

## Writing templates

```ts
import { jsx } from '@knighted/jsx'

const FancyButton = ({ label }: { label: string }) =>
  jsx`
    <button>
      ${label}
    </button>
  `

class Widget extends HTMLElement {
  render() {
    return html`
      <div class="card">
        ${jsx`
          <${FancyButton} label="Launch" />
        `}
      </div>
    `
  }
}
```

During the build the loader rewrites everything inside `${jsx``}` so each dynamic chunk becomes a regular `${expression}` in the output template literal. Keep writing JSX exactly as you would in `.tsx` files: wrap dynamic bits with braces (`className={value}`, `{children}`, spread props, etc.). At runtime `@knighted/jsx` turns the transformed template back into live DOM nodes (or React elements when using `reactJsx`).

## Limitations & notes

- Only tagged template literals that use the configured names are transformed; normal `.tsx` files still need your existing JSX transformer.
- Template literal `${expr}` segments that sit outside JSX braces are wrapped automatically so destructured props, inline values, and children remain live without extra boilerplate.
- The loader runs synchronously—avoid work that needs async I/O.
- When targeting the React runtime, ensure `react`/`react-dom` are bundled so `reactJsx` can call `React.createElement`.

## Tips

- Import from `@knighted/jsx/lite` when you want the smallest runtime bundle—the loader output stays the same.
- Lit templates can safely embed ` jsx`` ` inside ` html`` ` blocks; the runtime returns DOM nodes or `DocumentFragment` instances that Lit inserts like any other value.
- Frameworks such as Next.js or Remix should add the loader as a post-loader so SWC/Babel execute first and the tagged template literals are rewritten afterward.

## End-to-end demo bundle

The repository ships a Rspack + Lit + React fixture under `test/fixtures/rspack-app/`. The Vitest integration test (`test/loader.e2e.test.ts`) builds that fixture, stubs the parser WASM binding, and verifies the loader pipeline inside a real bundler. Prefer a standalone repo instead? Walk through [morganney/jsx-loader-demo](https://github.com/morganney/jsx-loader-demo) for a minimal bundler-focused project you can clone directly.

Manual preview steps:

1. Build the library (`npm run build`) so the loader artifacts exist under `dist/`.
2. Install the parser WASM binding (`npm run setup:wasm`) to enable JSX parsing outside Node. Pass `-- --use-stub` to `npm run build:fixture` only if you deliberately want the no-op parser stub.
3. Run `npm run build:fixture` to emit `test/fixtures/rspack-app/dist/bundle.js` via Rspack.
4. Serve the fixture folder (`npx http-server test/fixtures/rspack-app -p 8080`) and open it in a browser. You will see a Lit component that embeds DOM returned by `jsx` alongside a React badge rendered through `reactJsx`.

The e2e test normally writes to a temporary directory and cleans up afterward. Use the steps above when you need a persistent bundle for manual inspection—the real WASM binding is required for interactive parsing; the stub exists strictly for loader smoke tests.
