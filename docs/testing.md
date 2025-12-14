# Testing components with `@knighted/jsx`

This guide focuses on testing your own components and templates built with the DOM runtime (`jsx`) and the React runtime (`reactJsx`). It assumes a modern test runner such as Vitest or Jest.

## Setup

- Use a DOM-like environment (jsdom or happy-dom) when exercising the DOM runtime. In Vitest set `environment: 'jsdom'`; in Jest use `testEnvironment: 'jsdom'`.
- If you render React elements, install `react` and `react-dom` (React 18+) and keep `jsxImportSource` pointed at `@knighted/jsx` in your TS config when authoring `.tsx` test helpers.
- For pure Node/SSR tests, import from `@knighted/jsx/node` (or `/node/react`) so a DOM shim is bootstrapped automatically.

## DOM runtime (`jsx`)

Prefer letting the template tag create the elements you assert against. You can still reuse your own utility functions, but keep the DOM creation inside the tagged template so JSX semantics stay the same as production.

```ts
// counter.ts
import { jsx } from '@knighted/jsx'

export const Counter = ({ label, onClick }: { label: string; onClick: () => void }) =>
  jsx`<button type="button" onClick={${onClick}}>${label}</button>`
```

```ts
// counter.test.ts
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { Counter } from './counter.js'

test('invokes handler', async () => {
  const user = userEvent.setup()
  const handleClick = vi.fn()

  document.body.innerHTML = ''
  document.body.append(Counter({ label: 'Click me', onClick: handleClick }))

  await user.click(screen.getByRole('button', { name: /click me/i }))
  expect(handleClick).toHaveBeenCalledTimes(1)
})
```

Tips:

- If you need attributes or content that come from the test, prefer explicit JSX-style braces so intent is clear: `` jsx`<div data-id={${id}}>${text}</div>` ``, although either approach works.
- For lists, interpolate arrays/iterables; the runtime flattens them. Example: ``${items.map(item => jsx`<li>${item}</li>`)}``.
- When you need a DOM shim without a browser, use `@knighted/jsx/node` and bring `jsdom` or `linkedom` as a dev dependency.

## React runtime (`reactJsx`)

`reactJsx` returns React elements, so you can test with React Testing Library the same way you test normal components.

```ts
// greeting.tsx
import { useState } from 'react'
import { reactJsx } from '@knighted/jsx/react'

export const Greeting = ({ name }: { name: string }) => {
  const [count, setCount] = useState(0)
  return reactJsx`
    <section>
      <p>Hello ${name}</p>
      <button onClick={${() => setCount(value => value + 1)}}>
        Clicked ${count} times
      </button>
    </section>
  `
}
```

```ts
// greeting.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Greeting } from './greeting.js'

test('increments count', async () => {
  const user = userEvent.setup()
  render(reactJsx`<${Greeting} name={${'Ada'}} />`)

  const button = screen.getByRole('button', { name: /clicked 0 times/i })
  await user.click(button)

  expect(screen.getByRole('button', { name: /clicked 1 times/i })).toBeVisible()
})
```

Notes:

- Interpolated components (`<${MyComponent} />`) work the same in tests as they do at runtime.
- If your test runner compiles TypeScript, keep `jsxImportSource` set to `@knighted/jsx` (or use plain `.ts` files and tagged templates, as shown above).
- For SSR-oriented tests, import from `@knighted/jsx/node/react` and render with `react-dom/server` as usual; the helper will still honor your templates.

## Troubleshooting

- Missing `jsx-runtime` errors: reinstall dependencies (or re-run your package manager) so the `@knighted/jsx/jsx-runtime` entry from this package is available. Tagged templates in `.ts` files do not load that module, but `.tsx` helpers compiled with `jsxImportSource` still expect it to exist.
- If events fail to fire, verify your environment is `jsdom`/`happy-dom` and that the element was appended to the document (some libraries query `document.body`).
