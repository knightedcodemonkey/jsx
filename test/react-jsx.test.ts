import { beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { Children, act } from 'react'
import type { ReactNode } from 'react'

import { reactJsx, type ReactJsxComponent } from '../src/react/index.js'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const resetDom = () => {
  document.body.innerHTML = ''
}

describe('reactJsx template tag', () => {
  beforeEach(resetDom)

  it('renders React components and DOM nodes through ReactDOM', () => {
    const Badge: ReactJsxComponent<{ label: string }> = ({ label }) =>
      reactJsx`
        <button className="react-badge" type="button">
          Badge:{' '}{${label}}
        </button>
      `

    const view = reactJsx`
      <section data-kind="react-view">
        <h2>React JSX Runtime</h2>
        <${Badge} label={${'Ready'}} />
      </section>
    `

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    act(() => {
      root.render(view)
    })

    expect(container.querySelector('h2')?.textContent).toBe('React JSX Runtime')
    expect(container.querySelector('.react-badge')?.textContent).toBe('Badge: Ready')

    act(() => {
      root.unmount()
    })
  })

  it('allows inline text expressions without JSX braces', () => {
    const Accent = reactJsx`<strong>bold</strong>`

    const tree = reactJsx`
      <p>
        Hello ${'react'} and ${Accent}!
      </p>
    `

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    act(() => {
      root.render(tree)
    })

    expect(container.textContent).toBe('Hello react and bold!')

    act(() => {
      root.unmount()
    })
  })

  it('supports fragments, spread children, and nested reactJsx nodes', () => {
    const items = ['alpha', 'beta', 'gamma']

    const List: ReactJsxComponent = () =>
      reactJsx`
        <ul>
          {...${items.map(item => reactJsx`<li key={${item}}>{${item}}</li>`)}}
        </ul>
      `

    const tree = reactJsx`
      <>
        <p>Total: {${items.length}}</p>
        <${List} />
      </>
    `

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    act(() => {
      root.render(tree)
    })

    const listItems = Array.from(container.querySelectorAll('li'))
    expect(listItems).toHaveLength(3)
    expect(listItems.map(node => node.textContent)).toEqual(items)

    act(() => {
      root.unmount()
    })
  })

  it('throws when encountering unknown component names', () => {
    expect(() => reactJsx`<MissingComponent />`).toThrow(
      'Unknown component "MissingComponent"',
    )
  })

  it('rejects async values inside expression containers', () => {
    expect(() => reactJsx`<section>{${Promise.resolve('later')}}</section>`).toThrow(
      'Async values are not supported inside reactJsx template results.',
    )
  })

  it('merges spread attributes and flattens iterable children', () => {
    const extras = { role: 'status', 'aria-live': 'polite' } as const
    const items = new Set(['alpha', 'beta'])

    const element = reactJsx`
      <section {...${extras}} hidden data-note={${undefined}}>
        {/* drop this comment */}
        {${null}}
        {${false}}
        {${items}}
      </section>
    `

    const props = element.props as {
      role?: string
      'aria-live'?: string
      hidden?: boolean
      children?: ReactNode
      'data-note'?: string
    }

    expect(props.role).toBe('status')
    expect(props['aria-live']).toBe('polite')
    expect(props.hidden).toBe(true)
    expect(props['data-note']).toBeUndefined()

    const flattened = Children.toArray(props.children)
    expect(flattened.map(child => String(child)).join('')).toBe('alphabeta')
  })

  it('surfaces parser errors with helpful context when JSX is invalid', () => {
    expect(() => reactJsx`<section>`).toThrow('[oxc-parser]')
  })
})
