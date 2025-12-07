# Runtime Helper Overview (`jsx` and `reactJsx`)

This note explains how the runtime helpers behave when you call them directly—without involving the loader. Both helpers are plain JavaScript tagged template literals that lean on the `oxc-parser` WebAssembly build to interpret JSX syntax at execution time.

## What happens when you call the helpers?

1. **Template literal evaluation** – JavaScript collects the raw string segments (`strings`) and evaluated expressions (`values`) for the tagged template.
2. **Parser pass** – the helper feeds the string segments to `oxc-parser` (either the native Node binding or the WASM build) to build a JSX AST.
3. **Runtime construction**:
   - `jsx` walks the AST and creates DOM nodes (or `DocumentFragment` instances) directly using the active `document` implementation.
   - `reactJsx` converts the AST into `React.createElement` calls, returning React elements.
4. **Return value** – the helper hands back the DOM subtree or React element, so you decide how/where to insert or render it.

## DOM helper (`jsx`)

- Returns a `Node` or `DocumentFragment` you can append, pass to Lit, or use in any DOM-like environment.
- Works in browsers out of the box. In Node you can import `@knighted/jsx/node` to bootstrap a DOM shim (tries `linkedom`, then `jsdom`).
- Expressions inside the template (props, children, dynamic tags) are evaluated before parsing—no special placeholder syntax is required.

Example:

```ts
import { jsx } from '@knighted/jsx'

const badge = jsx`
  <button className={${`badge-${variant}`}} onClick={${handleClick}}>
    Ready in {${locale}}
  </button>
`

document.querySelector('#mount')?.append(badge)
```

## React helper (`reactJsx`)

- Returns a React element tree. You still render via `createRoot`, `renderToString`, etc.
- Identical template semantics to `jsx`, but expressions inside braces become arguments to `React.createElement` instead of DOM setters.
- Hooks/state work because you typically invoke `reactJsx` inside components or pass the elements to React.

Example:

```ts
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { reactJsx } from '@knighted/jsx/react'

const Counter = () => {
  const [count, setCount] = useState(0)
  return reactJsx`
    <section>
      <p>Count: {${count}}</p>
      <button onClick={${() => setCount(value => value + 1)}}>Increment</button>
    </section>
  `
}

createRoot(document.getElementById('react-root')!).render(reactJsx`<${Counter} />`)
```

## Brace placeholders vs. template slots

- `jsx` never sees JSX-style braces. JavaScript resolves every `${expression}` before parsing, so `{` and `}` in the template become plain text nodes. Whenever you want a dynamic prop, child, or tag you must rely on template literal interpolation (`${...}`) only.
- `reactJsx` mirrors React's JSX semantics. After JavaScript interpolates `${...}`, the tag still parses `{...}` blocks as runtime expressions, so `className={${css}}` works the same as `className={css}` in real JSX. Use `{...}` whenever you would inside `.jsx/.tsx` files; reach for `${...}` only when you need to inject a value into the surrounding template literal itself (for example, inline callbacks or computed identifiers).
- Both helpers share the same first-stage template literal behavior, but only `reactJsx` performs the second-stage brace evaluation. Keep that distinction in mind when porting snippets between the two helpers.

## Parser + WASM considerations

- Browser builds need the WASM binding from `@oxc-parser/binding-wasm32-wasi`. Install it (or rely on CDN bundles that already include it) so the helper can parse JSX outside Node.
- When running under Node, the helper automatically loads the native binding and falls back to WASM when necessary.

## Interop tips

- You can compose the helpers anywhere: vanilla scripts, Lit components, SSR utilities, etc. They’re just functions.
- The loader is optional. Use it when you want to pre-transform templates during bundling; skip it when you prefer runtime parsing (e.g., scripts that never hit Webpack).
- Mix DOM and React trees freely. A Lit component can render a host `<div>` for React, and React can receive DOM nodes produced by `jsx` via `dangerouslySetInnerHTML` or portals.

Keep this model in mind: the helpers are thin wrappers around template literals + `oxc-parser`. Everything else—loaders, SSR glue, fixtures—builds on that foundation.
