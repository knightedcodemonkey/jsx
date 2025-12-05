import { LitElement, html } from 'lit'
import { jsx, type JsxRenderable } from '@knighted/jsx'
import { reactJsx, type ReactJsxComponent } from '@knighted/jsx/react'
import { useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

type ReactBadgeProps = {
  label: string
}

const ReactBadge: ReactJsxComponent<ReactBadgeProps> = ({ label }: ReactBadgeProps) => {
  const [clicks, setClicks] = useState(0)

  return (
    <button
      className="react-badge"
      type="button"
      onClick={() => setClicks(value => value + 1)}
    >
      {label}
      {' · clicks: '}
      {clicks}
    </button>
  )
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
  private reactHost?: HTMLElement

  private renderReactTree(tree: ReactElement): HTMLElement {
    if (!this.reactHost) {
      this.reactHost = document.createElement('span')
    }

    if (!this.reactRoot && this.reactHost) {
      this.reactRoot = createRoot(this.reactHost)
    }

    this.reactRoot?.render(tree)
    return this.reactHost
  }

  disconnectedCallback() {
    this.reactRoot?.unmount()
    this.reactRoot = undefined
    this.reactHost = undefined
    super.disconnectedCallback()
  }

  render() {
    const label = 'Hybrid ready'
    const reactTree = reactJsx`
      <>
        <${ReactBadge} label={${label}} />
        <p data-kind="react-status">Rendered with reactJsx</p>
      </>
    `
    const reactNode = this.renderReactTree(reactTree)

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
