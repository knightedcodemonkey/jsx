import { LitElement, html } from 'lit'
import { jsx, type JsxRenderable } from '@knighted/jsx'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { jsx as reactJsx, jsxs as reactJsxs } from 'react/jsx-runtime'

type ReactBadgeProps = {
  label: string
}

const ReactBadge = ({ label }: ReactBadgeProps) => {
  const [clicks, setClicks] = useState(0)

  return reactJsxs('button', {
    className: 'react-badge',
    type: 'button',
    onClick: () => setClicks((value: number) => value + 1),
    children: [label, ' · clicks: ', clicks],
  })
}

type HybridCardProps = {
  title: string
  reactNode: Node
  children?: JsxRenderable
}

const HybridCard = ({ title, reactNode, children }: HybridCardProps) =>
  jsx`
    <article className="hybrid-card">
      <h2>${title}</h2>
      <div className="react-slot">${reactNode}</div>
      <div className="nested-slot">${children}</div>
    </article>
  `

const NestedListItem = ({ label }: { label: string }) =>
  jsx`
    <li data-kind="react-nested">
      Nested slot from React component:
      <strong>${label}</strong>
    </li>
  `

type ReactRoot = ReturnType<typeof createRoot>

class HybridElement extends LitElement {
  private reactRoot?: ReactRoot
  private reactBadgeHost?: HTMLElement

  private mountReactBadge(label: string) {
    if (this.reactBadgeHost) {
      return this.reactBadgeHost
    }

    const host = document.createElement('span')
    this.reactRoot = createRoot(host)
    this.reactRoot.render(reactJsx(ReactBadge, { label }))
    this.reactBadgeHost = host
    return host
  }

  disconnectedCallback() {
    this.reactRoot?.unmount()
    this.reactRoot = undefined
    this.reactBadgeHost = undefined
    super.disconnectedCallback()
  }

  render() {
    const label = 'Hybrid ready'
    const reactNode = this.mountReactBadge(label)

    return html`
      <section>
        ${jsx`
          <>
            <${HybridCard} title={${label}} reactNode={${reactNode}}>
              <ul className="nested-list">
                <${NestedListItem} label={${label}} />
              </ul>
            </${HybridCard}>
            <p data-kind="lit">Works with Lit + React</p>
          </>
        `}
      </section>
    `
  }
}

customElements.define('hybrid-element', HybridElement)

export const tagName = 'hybrid-element'
