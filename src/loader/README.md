# `@knighted/jsx` Loader

Transform ` jsx`` ` and ` reactJsx`` ` tagged template literals inside any bundler that supports webpack-style loaders (Rspack, Webpack, etc.). The loader rewrites JSX syntax that lives in template literals so the runtime helpers can execute it later—ideal when you want JSX inside Lit components, custom elements, or shared utilities without adding a `.tsx` transpilation step.

## Installation

```sh
npm install @knighted/jsx
```

The loader ships with the package; no extra peer dependency is required.

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

| Option | Type       | Default               | Description                                                                                                 |
| ------ | ---------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `tags` | `string[]` | `['jsx', 'reactJsx']` | Names of tagged template helpers to transform. Add aliases if you re-export the helpers under custom names. |
| `tag`  | `string`   | `undefined`           | Legacy single-tag option. Prefer `tags`, but this remains for backward compatibility.                       |

## Writing templates

```ts
import { jsx } from '@knighted/jsx'

const FancyButton = ({ label }: { label: string }) =>
  jsx`
    <button>
      {${label}}
    </button>
  `

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

The repository ships a Rspack + Lit + React fixture under `test/fixtures/rspack-app/`. The Vitest integration test (`test/loader.e2e.test.ts`) builds that fixture, stubs the parser WASM binding, and verifies the loader pipeline inside a real bundler.

Manual preview steps:

1. Build the library (`npm run build`) so the loader artifacts exist under `dist/`.
2. Install the parser WASM binding (`npm run setup:wasm`) to enable JSX parsing outside Node. Pass `-- --use-stub` to `npm run build:fixture` only if you deliberately want the no-op parser stub.
3. Run `npm run build:fixture` to emit `test/fixtures/rspack-app/dist/bundle.js` via Rspack.
4. Serve the fixture folder (`npx http-server test/fixtures/rspack-app -p 8080`) and open it in a browser. You will see a Lit component that embeds DOM returned by `jsx` alongside a React badge rendered through `reactJsx`.

The e2e test normally writes to a temporary directory and cleans up afterward. Use the steps above when you need a persistent bundle for manual inspection—the real WASM binding is required for interactive parsing; the stub exists strictly for loader smoke tests.
