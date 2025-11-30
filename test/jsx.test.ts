import { beforeEach, describe, expect, it, vi } from 'vitest'

import { jsx, type JsxComponent } from '../src/jsx.js'

const resetDom = () => {
  document.body.innerHTML = ''
}

describe('jsx template tag', () => {
  beforeEach(resetDom)

  it('renders DOM nodes with props, events, and text', () => {
    const handleClick = vi.fn()
    const count = 3
    const button = jsx`
      <button
        className={${['primary', 'pill']}}
        data-count={${count}}
        onClick={${handleClick}}
      >
        Count is {' '}{${count}}
      </button>
    ` as HTMLButtonElement

    document.body.append(button)

    button.dispatchEvent(new Event('click'))

    expect(handleClick).toHaveBeenCalledTimes(1)
    expect(button.className).toBe('primary pill')
    expect(button.dataset.count).toBe(String(count))
    expect(button.textContent).toBe('Count is 3')
  })

  it('supports custom components with props and children', () => {
    const Panel: JsxComponent<{ title: string }> = ({ title, children }) =>
      jsx`
        <section className="panel">
          <header>{${title}}</header>
          <div className="panel-body">{${children}}</div>
        </section>
      `

    const result = jsx`
      <${Panel} title={${'Greetings'}}>
        {${'Welcome aboard'}}
      </${Panel}>
    ` as HTMLElement

    expect(result.tagName).toBe('SECTION')
    expect(result.querySelector('header')?.textContent).toBe('Greetings')
    expect(result.querySelector('.panel-body')?.textContent).toBe('Welcome aboard')
  })

  it('returns a fragment for multi-root JSX and handles iterables', () => {
    const values = ['alpha', 'beta', 'gamma']
    const fragment = jsx`
      <>
        {${values.map(value => jsx`<li>{${value}}</li>`)}}
      </>
    ` as DocumentFragment

    expect(fragment.childNodes).toHaveLength(3)
    expect(Array.from(fragment.querySelectorAll('li')).map(li => li.textContent)).toEqual(
      values,
    )
  })
})
