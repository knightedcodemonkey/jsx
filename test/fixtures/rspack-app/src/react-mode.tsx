import { LitElement, html } from 'lit'
import { jsx } from '@knighted/jsx'
import { reactJsx, type ReactJsxComponent } from '@knighted/jsx/react'
import { useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

type ReactChildrenProps = {
  children: ReactNode
}

const HeadingContainer: ReactJsxComponent<ReactChildrenProps> = ({ children }) =>
  reactJsx`
    <h2 className="react-only-card__title">
      ${children}
    </h2>
  `

const HeadingAccent: ReactJsxComponent<ReactChildrenProps> = ({ children }) =>
  reactJsx`
    <span className="react-only-card__title-accent">
      ${children}
    </span>
  `

const HeadingHighlight: ReactJsxComponent<ReactChildrenProps> = ({ children }) =>
  reactJsx`
    <strong className="react-only-card__title-highlight">
      ${children}
    </strong>
  `

const HeadingNote: ReactJsxComponent<ReactChildrenProps> = ({ children }) =>
  reactJsx`
    <small className="react-only-card__title-note">
      ${children}
    </small>
  `

type ReactOnlyCardProps = {
  heading: string
}

const ReactOnlyCard: ReactJsxComponent<ReactOnlyCardProps> = ({ heading }) => {
  const [clicks, setClicks] = useState(0)
  const OuterHeadingTag = HeadingContainer
  const InnerHeadingTag = HeadingAccent
  const DeepHeadingTag = HeadingHighlight
  const SiblingHeadingTag = HeadingNote

  return reactJsx`
    <article className="react-only-card">
      <header>
        <${OuterHeadingTag}>
          <${InnerHeadingTag}>
            <${DeepHeadingTag}>${heading}</${DeepHeadingTag}>
          </${InnerHeadingTag}>
          <${SiblingHeadingTag}>Sibling annotation</${SiblingHeadingTag}>
        </${OuterHeadingTag}>
        <p data-kind="react">Compiled through reactJsx (react mode)</p>
      </header>
      <button type="button" onClick={${() => setClicks(value => value + 1)}}>
        Clicked${' '}${clicks}${' '}times
      </button>
    </article>
  `
}

type ReactRoot = ReturnType<typeof createRoot>

class ReactModeElement extends LitElement {
  private reactRoot?: ReactRoot

  private mountReact() {
    const host = this.renderRoot.querySelector('.react-only-host') as HTMLElement | null
    if (!host) {
      return
    }

    if (!this.reactRoot) {
      this.reactRoot = createRoot(host)
    }

    const label = 'React mode ready'
    const tree = reactJsx`
      <div className="react-only-stage">
        <${ReactOnlyCard} heading={${label}} />
      </div>
    `

    this.reactRoot.render(tree)
  }

  disconnectedCallback() {
    this.reactRoot?.unmount()
    this.reactRoot = undefined
    super.disconnectedCallback()
  }

  firstUpdated() {
    this.mountReact()
  }

  updated() {
    this.mountReact()
  }

  render() {
    return html`
      ${jsx`
        <section className="react-mode-wrapper">
          <p data-kind="lit">Lit host keeps working</p>
          <div className="react-only-host"></div>
        </section>
      `}
    `
  }
}

customElements.define('react-mode-element', ReactModeElement)
