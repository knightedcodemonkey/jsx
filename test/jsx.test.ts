import { beforeEach, describe, expect, it, vi } from 'vitest'

import { jsx, type JsxComponent, type JsxRenderable } from '../src/jsx.js'

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
        Count is{' '}${count}
      </button>
    ` as HTMLButtonElement

    document.body.append(button)

    button.dispatchEvent(new Event('click'))

    expect(handleClick).toHaveBeenCalledTimes(1)
    expect(button.className).toBe('primary pill')
    expect(button.dataset.count).toBe(String(count))
    expect(button.textContent).toBe('Count is 3')
  })

  it('supports capture-phase handlers via the Capture suffix', () => {
    const captureHandler = vi.fn()
    const bubbleHandler = vi.fn()

    const tree = jsx`
      <div onClickCapture={${captureHandler}}>
        <button onClick={${bubbleHandler}}>Click me</button>
      </div>
    ` as HTMLDivElement

    document.body.append(tree)

    tree.querySelector('button')?.click()

    expect(captureHandler).toHaveBeenCalledTimes(1)
    expect(bubbleHandler).toHaveBeenCalledTimes(1)
    expect(captureHandler.mock.invocationCallOrder[0]).toBeLessThan(
      bubbleHandler.mock.invocationCallOrder[0],
    )
  })

  it('handles custom events via the on: prefix and handler descriptors', () => {
    const customHandler = vi.fn()
    const descriptorHandler = vi.fn()

    const element = jsx`
      <section
        on:widget-toggle={${customHandler}}
        on:readyCapture={${{ handler: descriptorHandler, once: true }}}
      />
    ` as HTMLElement

    element.dispatchEvent(new CustomEvent('widget-toggle'))
    expect(customHandler).toHaveBeenCalledTimes(1)

    element.dispatchEvent(new CustomEvent('ready', { bubbles: true }))
    element.dispatchEvent(new CustomEvent('ready', { bubbles: true }))

    expect(descriptorHandler).toHaveBeenCalledTimes(1)
  })

  it('inlines dynamic text expressions without extra braces', () => {
    const strong = document.createElement('strong')
    strong.textContent = 'bold'

    const paragraph = jsx`
      <p>
        Hello ${'world'} and ${strong}!
      </p>
    ` as HTMLParagraphElement

    expect(paragraph.textContent).toBe('Hello world and bold!')
    expect(paragraph.querySelector('strong')?.textContent).toBe('bold')
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

  it('applies style objects and class aliases', () => {
    const element = jsx`
      <div
        class={${['block', 'rounded']}}
        style={${{ backgroundColor: 'rgb(10, 20, 30)', '--accent-hue': '210' }}}
      />
    ` as HTMLDivElement

    expect(element.className).toBe('block rounded')
    expect(element.style.backgroundColor).toBe('rgb(10, 20, 30)')
    expect(element.style.getPropertyValue('--accent-hue')).toBe('210')
  })

  it('supports htmlFor, data attributes, and boolean props', () => {
    const label = jsx`
      <label htmlFor={${'example-input'}} data-test-id={${'abc'}} hidden={${true}}>
        Label text
      </label>
    ` as HTMLLabelElement

    expect(label.getAttribute('for')).toBe('example-input')
    expect(label.dataset.testId).toBe('abc')
    expect(label.hasAttribute('hidden')).toBe(true)
  })

  it('renders innerHTML payloads safely', () => {
    const html = '<span class="danger">watch me</span>'
    const container = jsx`
      <section dangerouslySetInnerHTML={${{ __html: html }}} />
    ` as HTMLElement

    expect(container.querySelector('.danger')?.textContent).toBe('watch me')
  })

  it('supports callback and object refs plus DOM property assignment', () => {
    const fnRef = vi.fn()
    const objRef: { current: HTMLInputElement | null } = { current: null }
    const input = jsx`
      <input ref={${fnRef}} value={${'hello'}} />
    ` as HTMLInputElement
    const bound = jsx`
      <input ref={${objRef}} className={${'secondary'}} />
    ` as HTMLInputElement

    expect(fnRef).toHaveBeenCalledTimes(1)
    expect(fnRef).toHaveBeenCalledWith(input)
    expect(input.value).toBe('hello')
    expect(objRef.current).toBe(bound)
    expect(bound.className).toBe('secondary')
  })

  it('throws when DOM APIs are unavailable', () => {
    const originalCreateElement = document.createElement
    ;(document as Document & { createElement: unknown }).createElement =
      undefined as never

    try {
      expect(() => jsx`<div />`).toThrow(
        'The jsx template tag requires a DOM-like environment (document missing).',
      )
    } finally {
      ;(
        document as Document & { createElement: typeof originalCreateElement }
      ).createElement = originalCreateElement
    }
  })

  it('throws helpful parser errors for invalid markup', () => {
    expect(() => jsx`<div>`).toThrow('[oxc-parser]')
  })

  it('supports inline JSX expressions inside children', () => {
    const element = jsx`
      <div class="inline-wrapper">
        {<span data-type="inline">Inline literal</span>}
      </div>
    ` as HTMLDivElement

    expect(element.querySelector('span')?.textContent).toBe('Inline literal')
    expect(element.querySelector('span')?.dataset.type).toBe('inline')
  })

  it('surfaces evaluation errors from expression containers', () => {
    expect(
      () =>
        jsx`
        <div data-error={(() => {
          throw new Error('kaboom')
        })()} />
      `,
    ).toThrow('Failed to evaluate expression')
  })

  it('skips falsey props and style entries with null values', () => {
    const button = jsx`
      <button
        disabled={${false}}
        title={${null}}
        data-extra={${undefined}}
        style={${{ color: null, padding: '4px' }}}
      />
    ` as HTMLButtonElement

    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.hasAttribute('data-extra')).toBe(false)
    expect(button.getAttribute('title')).toBeNull()
    expect(button.style.padding).toBe('4px')
    expect(button.style.color).toBe('')
  })

  it('supports generic iterables and rejects async values', () => {
    const items = new Set([jsx`<li>first</li>`, jsx`<li>second</li>`])
    const list = jsx`
      <ul>{${items}}</ul>
    ` as HTMLUListElement

    expect(Array.from(list.querySelectorAll('li')).map(item => item.textContent)).toEqual(
      ['first', 'second'],
    )

    expect(
      () =>
        jsx`
        <div>{${Promise.resolve('later')}}</div>
      `,
    ).toThrow('Async values are not supported inside jsx template results.')
  })

  it('handles dynamic tag names and sanitizes binding identifiers', () => {
    const tagName = 'section'

    const NoNamed: JsxComponent = () => jsx`<p data-kind="empty">none</p>`
    NoNamed.displayName = '!!!'

    const Numeric: JsxComponent = () => jsx`<p data-kind="numeric">numbers</p>`
    Numeric.displayName = '123Heading'

    const DuplicateLeft: JsxComponent = () => jsx`<p data-kind="duplicate">left</p>`
    DuplicateLeft.displayName = 'Repeat'
    const DuplicateRight: JsxComponent = () => jsx`<p data-kind="duplicate">right</p>`
    DuplicateRight.displayName = 'Repeat'

    const tree = jsx`
      <${tagName}>
        <${NoNamed} />
        <${Numeric} />
        <${DuplicateLeft} />
        <${DuplicateRight} />
      </${tagName}>
    ` as HTMLElement

    const paragraphs = Array.from(tree.querySelectorAll('p'))
    expect(tree.tagName).toBe('SECTION')
    expect(paragraphs).toHaveLength(4)
    expect(paragraphs.map(node => node.dataset.kind)).toEqual([
      'empty',
      'numeric',
      'duplicate',
      'duplicate',
    ])
    expect(paragraphs[2]?.textContent).toBe('left')
    expect(paragraphs[3]?.textContent).toBe('right')
  })

  it('respects spread props for children and ignores keys', () => {
    const spreadProps = {
      key: 'ignored',
      children: ['from spread ', jsx`<strong>child</strong>`],
    }

    const element = jsx`
      <div {...${spreadProps}} />
    ` as HTMLDivElement

    expect(element.textContent).toBe('from spread child')
    expect(element.querySelector('strong')?.textContent).toBe('child')
  })

  it('skips empty expression containers and expands spread children', () => {
    const primary = [jsx`<li>alpha</li>`, jsx`<li>beta</li>`]
    const trailing = [jsx`<li>gamma</li>`]

    const list = jsx`
      <ul>
        {/* whitespace only */}
        {...${primary}}
        {...${null}}
        {...${trailing}}
      </ul>
    ` as HTMLUListElement

    expect(Array.from(list.querySelectorAll('li')).map(item => item.textContent)).toEqual(
      ['alpha', 'beta', 'gamma'],
    )
    expect(list.textContent?.includes('whitespace only')).toBe(false)
  })

  it('passes arrays of children to components when multiple nodes are provided', () => {
    const Collector: JsxComponent<{ children?: JsxRenderable | JsxRenderable[] }> = ({
      children,
    }) => {
      const count = Array.isArray(children) ? children.length : 0
      return jsx`
        <div data-count={${count}}>{${children}}</div>
      `
    }

    const rendered = jsx`
      <${Collector}>
        <span>one</span>
        <span>two</span>
      </${Collector}>
    ` as HTMLDivElement

    expect(rendered.dataset.count).toBe('2')
    expect(rendered.querySelectorAll('span')).toHaveLength(2)
  })

  it('rejects async component outputs', () => {
    const AsyncComponent = (async () => jsx`<div>async</div>`) as unknown as JsxComponent

    expect(() => jsx`<${AsyncComponent} />`).toThrow(
      'Async jsx components are not supported.',
    )
  })

  it('throws when encountering unknown component names', () => {
    expect(() => jsx`<Missing />`).toThrow('Unknown component "Missing"')
  })
})
