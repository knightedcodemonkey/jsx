import { jsx, type JsxComponent } from '@knighted/jsx/lite'
import './style.css'

const Tagline: JsxComponent<{ accent?: string }> = ({ children, accent = 'soft' }) => {
  const tone = accent === 'soft' ? 'Bend JSX literals to your will.' : accent
  return jsx`
    <p>
      <strong>${tone}</strong>
      <br />
      ${children}
    </p>
  `
}

const Counter: JsxComponent = (() => {
  let clicks = 0
  return () => {
    const button = document.createElement('button')
    button.className = 'demo-button'
    button.textContent = `Clicks: ${clicks}`
    button.addEventListener('click', () => {
      clicks += 1
      button.textContent = `Clicks: ${clicks}`
    })
    return button
  }
})()

const Card: JsxComponent<{ title: string }> = ({ title, children }) =>
  jsx`
    <article className="demo-card">
      <h1>${title}</h1>
      <div className="stack">${children}</div>
    </article>
  `

type FeatureGroup = {
  title: string
  tone: 'accent' | 'primary' | 'muted'
  live: 'polite' | 'assertive'
  items: Array<{
    label: string
    count: number
    hue: number
    hidden?: boolean
    emphasized?: boolean
  }>
}

const featureMatrix: FeatureGroup[] = [
  {
    title: 'Component props',
    tone: 'accent',
    live: 'polite',
    items: [
      { label: 'Function props', count: 2, hue: 160 },
      { label: 'Boolean props', count: 4, hue: 120, emphasized: true },
      { label: 'Style objects', count: 3, hue: 210 },
    ],
  },
  {
    title: 'DOM attributes',
    tone: 'primary',
    live: 'assertive',
    items: [
      { label: 'Data attributes', count: 6, hue: 30 },
      { label: 'Aria tags', count: 5, hue: 10, hidden: false },
      { label: 'Event handlers', count: 3, hue: 280 },
    ],
  },
  {
    title: 'Children rendering',
    tone: 'muted',
    live: 'polite',
    items: [
      { label: 'Nested fragments', count: 4, hue: 320 },
      { label: 'Iterables', count: 7, hue: 200 },
      { label: 'Text nodes', count: 2, hue: 45 },
    ],
  },
]

const DeepTree: JsxComponent<{ heading: string; footerLink: string }> = ({
  heading,
  footerLink,
}) => {
  const badges = featureMatrix.map(
    group =>
      jsx`
      <li
        key={${group.title}}
        className="feature-group"
        data-tone={${group.tone}}
        aria-live={${group.live}}
      >
        <h3>${group.title}</h3>
        <ul className="feature-grid">
          {${group.items.map(
            item =>
              jsx`
              <li
                key={${item.label}}
                className="feature-row"
                data-count={${item.count}}
                aria-hidden={${item.hidden ?? false}}
                aria-pressed={${item.emphasized ?? false}}
                style={${{ '--badge-hue': `${item.hue}` }}}
              >
                <span className="feature-label">${item.label}</span>
                <span className="feature-value">${item.count}</span>
              </li>
            `,
          )}}
        </ul>
      </li>
    `,
  )

  return jsx`
    <section id="deep-demo" className="deep-tree" data-groups={${badges.length}}>
      <header>
        <p className="eyebrow">Deep JSX verification</p>
        <h2>${heading}</h2>
        <p>
          This tree renders multiple nested fragments, dynamic attributes, and array children.
        </p>
      </header>
      <ul className="feature-list">{${badges}}</ul>
      <footer>
        <a className="demo-link" href={${footerLink}} target="_blank" rel="noreferrer">
          Inspect DOM snapshot ↗
        </a>
      </footer>
    </section>
  `
}

const view = jsx`
  <>
    <${Card} title={${'Live demo'}}>
      <${Tagline}>
        ${'Use @knighted/jsx directly in the browser with native modules.'}
      </${Tagline}>
      <${Counter} />
      <a className="demo-link" href="#deep-demo">
        ${'Jump to the deeply nested JSX example'}
      </a>
    </${Card}>
    <${DeepTree} heading={${'Nested JSX stress test'}} footerLink={${'https://github.com/knightedcodemonkey/jsx'}} />
  </>
` as DocumentFragment

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('#app mount point is missing')
}

root.replaceChildren(view)
