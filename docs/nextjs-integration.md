# Next.js Integration

> **TL;DR:** Next already knows how to compile `.tsx`/`.jsx`. Add the `@knighted/jsx/loader` only when you need the tagged-template runtime during SSR (for example, to pre-render DOM snippets, mix DOM + React output, or reuse server utilities that rely on `jsx`/`reactJsx`).

## 1. Point Next at your built artifacts

After running `npm run build` (which outputs `dist/`), alias the package and register the loader as a post-loader so it runs after SWC:

```js
// next.config.mjs
import path from 'node:path'

const distDir = path.resolve(process.cwd(), 'dist')

export default {
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@knighted/jsx': path.join(distDir, 'index.js'),
      '@knighted/jsx/react': path.join(distDir, 'react/index.js'),
    }

    config.module.rules.push({
      test: /\.[jt]sx?$/,
      enforce: 'post',
      use: [{ loader: path.join(distDir, 'loader/jsx.js') }],
    })

    return config
  },
}
```

## 2. Mix DOM + React output inside your pages

With the loader in place you can generate DOM fragments on the server and hydrate React components on the client using the same helpers:

```ts
// pages/index.tsx (or an app/ route)
import { jsx } from '@knighted/jsx'
import { reactJsx } from '@knighted/jsx/react'

const buildDomShell = () =>
  jsx`
    <section data-kind="dom-runtime">
      <p>Rendered on the server</p>
    </section>
  `

export async function getServerSideProps() {
  return { props: { domHtml: buildDomShell().outerHTML } }
}

export default function Page({ domHtml }: { domHtml: string }) {
  return reactJsx`
    <main>
      <button type="button">React badge</button>
      <div dangerouslySetInnerHTML={${{ __html: domHtml }}}></div>
    </main>
  `
}
```

> **Tip:** The same pattern works in `app/` routes, API handlers, and server actions anywhere you want DOM output produced by the runtime.

## 3. Verify with the fixture

This repo includes `test/fixtures/next-app`, which wires everything together. Build it locally to see the integration end to end:

```sh
npx next build test/fixtures/next-app
```

Or run the automated test, which builds the app and checks the emitted HTML:

```sh
npx vitest run test/next-fixture.test.ts
```

That fixture doubles as a template when you want to copy the setup into your own project.
