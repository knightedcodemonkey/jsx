# React SSR with `@knighted/jsx`

This guide shows how to compile JSX tagged templates with `@knighted/jsx/loader` and render them on the server with `@knighted/jsx/node/react`.

> [!TIP]
> There is a complete example including hydration at [morganney/jsx-node-playground](https://github.com/morganney/jsx-node-playground)

## When to use the loader

- Use the runtime tag directly when you want zero build steps. Import `reactJsx` from `@knighted/jsx/node/react` and return `ReactElement`s.
- Use the loader in **react** mode when you want the tagged template rewritten to `React.createElement` calls at build time. The loader appends helper shims (`__jsxReact`, `__jsxReactMergeProps`) to each transformed module and expects `React` to be in scope.

## Example project layout

```
app.ts          # React tree built with reactJsx tagged templates
render.ts       # Renders App to an HTML string
server.ts       # Node HTTP entry (routing + response)
rspack.config.mjs
```

## Configure the loader (react mode)

```js
// rspack.config.mjs
import { defineConfig } from '@rspack/cli'

export default defineConfig({
  entry: './server.ts',
  target: 'node',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/, // no need for tsx files
        use: [
          {
            loader: 'builtin:swc-loader', // transpile TS to JS
            options: {
              jsc: { parser: { syntax: 'typescript' } },
            },
          },
          {
            loader: '@knighted/jsx/loader',
            options: {
              tags: ['reactJsx'], // transform this tag
              mode: 'react', // emit React helpers + createElement calls
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
})
```

- Only files containing `reactJsx` are mutated; helpers are appended once per transformed module.
- If you need mixed modes, set `tagModes: { reactJsx: 'react', jsx: 'runtime' }`.

## Author components with `reactJsx` (UI)

```ts
// app.ts
import React from 'react'
import { reactJsx } from '@knighted/jsx/node/react'

const Button = ({ label }: { label: string }) => reactJsx`<button>${label}</button>`

export const App = ({ name }: { name: string }) =>
  reactJsx`<main><h1>Hello, ${name}</h1><${Button} label="SSR" /></main>`
```

- At build time the loader rewrites the template to `__jsxReact(...)` helpers that call `React.createElement`.
- You can omit the runtime import if every file is compiled by the loader; keeping it is harmless and can help editor IntelliSense.

## Render to HTML (no HTTP yet)

```ts
// render.ts
import React from 'react'
import { renderToString } from 'react-dom/server'
import { reactJsx } from '@knighted/jsx/node/react'
import { App } from './app.js'

export const render = (name: string) =>
  `<!doctype html>${renderToString(reactJsx`<${App} name=${name} />`)}`
```

## Server entry (HTTP + routing)

```ts
// server.ts
import http from 'node:http'
import { render } from './render.js'

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  if (req.url === '/' || req.url === '/home') {
    res.end(render('SSR'))
    return
  }
  res.statusCode = 404
  res.end('Not Found')
})

server.listen(3000, () => {
  console.log('SSR server listening on http://localhost:3000')
})
```

- Build with `rspack build --config rspack.config.mjs` (emits `dist/server.js`).
- Start with `node dist/server.js`.
- If you already use Express/Fastify, move the `render()` call into your route handler instead of the bare `http` server above.

## Notes

- The loader does not inject React itself—ensure `react` is installed and imported wherever helpers run, or use `rspack.ProviderPlugin`.
- Source maps: pass `sourceMap: true` in loader options if you want inline maps in server bundles.
- To keep bundle size predictable, keep `react` mode scoped to the tags you use and avoid transforming files that already use plain `React.createElement`.
