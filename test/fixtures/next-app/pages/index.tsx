import { useEffect, useRef, useState } from 'react'
import { jsx } from '@knighted/jsx'
import { reactJsx } from '@knighted/jsx/react'

const ReactBadge = () => {
  const [clicks, setClicks] = useState(0)

  return reactJsx`
    <button
      className="react-badge"
      type="button"
      onClick={${() => setClicks(value => value + 1)}}
    >
      React badge clicks: {${clicks}}
    </button>
  `
}

export default function HomePage() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!hostRef.current) return

    const domSection = jsx`
      <section data-kind="dom-runtime">
        <h2>DOM runtime</h2>
        <p>This block is rendered via the jsx helper after hydration.</p>
        <ul>
          {${['alpha', 'beta', 'gamma'].map(label => jsx`<li data-item={${label}}>{${label}}</li>`)} }
        </ul>
      </section>
    ` as HTMLElement

    hostRef.current.replaceChildren(domSection)
  }, [])

  return reactJsx`
    <main className="fixture-root">
      <h1>Next.js hybrid demo</h1>
      <p>React tree rendered via reactJsx helper.</p>
      <${ReactBadge} />
      <section className="dom-slot">
        <h2>DOM runtime area</h2>
        <div data-testid="jsx-host" ref={${hostRef}}>
          DOM runtime placeholder
        </div>
      </section>
    </main>
  `
}
