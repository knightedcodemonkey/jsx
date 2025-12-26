import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { jsx, type JsxComponent, type JsxRenderable } from '../src/jsx.js'
import { createResolveAttributes } from '../src/internal/attribute-resolution.js'
import {
  disableJsxDebugDiagnostics,
  enableJsxDebugDiagnostics,
} from '../src/debug/diagnostics.js'
import { find as findPropertyInfo, html as htmlProperties } from 'property-information'

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

  it('ignores handlers whose Capture suffix removes the on: event name', () => {
    const addSpy = vi.spyOn(HTMLButtonElement.prototype, 'addEventListener')

    try {
      const element = jsx`<button on:Capture={${() => {}}} />` as HTMLButtonElement
      expect(element.tagName).toBe('BUTTON')
      expect(addSpy).not.toHaveBeenCalled()
    } finally {
      addSpy.mockRestore()
    }
  })

  it('ignores handlers whose Capture suffix removes the standard event name', () => {
    const addSpy = vi.spyOn(HTMLButtonElement.prototype, 'addEventListener')

    try {
      const element = jsx`<button onCapture={${() => {}}} />` as HTMLButtonElement
      expect(element.tagName).toBe('BUTTON')
      expect(addSpy).not.toHaveBeenCalled()
    } finally {
      addSpy.mockRestore()
    }
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

  it('toggles boolean attributes explicitly and removes them when false', () => {
    const toggle = jsx`
      <button disabled={${true}} required={${false}} />
    ` as HTMLButtonElement

    expect(toggle.hasAttribute('disabled')).toBe(true)
    expect(toggle.disabled).toBe(true)
    expect(toggle.hasAttribute('required')).toBe(false)

    const enabled = jsx`
      <button disabled={${false}} />
    ` as HTMLButtonElement

    expect(enabled.hasAttribute('disabled')).toBe(false)
    expect(enabled.disabled).toBe(false)
  })

  it('serializes aria attributes as strings even for booleans', () => {
    const div = jsx`
      <div aria-hidden={${true}} aria-live={${'polite'}} aria-checked={${false}} />
    ` as HTMLDivElement

    expect(div.getAttribute('aria-hidden')).toBe('true')
    expect(div.getAttribute('aria-live')).toBe('polite')
    expect(div.getAttribute('aria-checked')).toBe('false')
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

  it('skips attributes backed by empty JSX expression containers', () => {
    const resolveAttributes = createResolveAttributes<JsxComponent>({
      getIdentifierName: identifier => (identifier as { name: string }).name,
      evaluateExpressionWithNamespace: () => {
        throw new Error('should not evaluate empty expressions')
      },
    })

    const props = resolveAttributes(
      [
        {
          type: 'JSXAttribute',
          name: { type: 'JSXIdentifier', name: 'data-empty' },
          value: {
            type: 'JSXExpressionContainer',
            expression: { type: 'JSXEmptyExpression' },
          },
        },
      ] as unknown as Parameters<typeof resolveAttributes>[0],
      {
        source: '',
        placeholders: new Map(),
        components: new Map(),
      } as Parameters<typeof resolveAttributes>[1],
      null,
    )

    expect(props).toEqual({})
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
    expect(() => jsx`<div>`).toThrowErrorMatchingInlineSnapshot(`
      [Error: [oxc-parser] Unexpected token
      --> jsx template:1:6
      1 | <div>
        |      ^]
    `)
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

  describe('edge cases and coverage guards', () => {
    it('applies and removes xml namespaced attributes through property metadata', () => {
      const element = jsx`<div xmlLang="en-US" />` as HTMLElement
      const xmlNamespace = 'http://www.w3.org/XML/1998/namespace'
      expect(element.getAttributeNS(xmlNamespace, 'lang')).toBe('en-US')

      const info = findPropertyInfo(htmlProperties, 'xmlLang')
      const originalBoolean = info.boolean

      try {
        info.boolean = true
        const toggled = jsx`<div xmlLang={${false}} />` as HTMLElement
        expect(toggled.hasAttributeNS(xmlNamespace, 'lang')).toBe(false)
      } finally {
        info.boolean = originalBoolean
      }
    })

    it('respects svg namespace assignment rules and colon attribute names', () => {
      const colonProps = { 'foo:bar': 'baz' }
      const svg = jsx`
        <svg>
          <a rel={${['prev', 'next']}} {...${colonProps}} />
        </svg>
      ` as SVGSVGElement

      const link = svg.querySelector('a') as SVGAElement | null
      expect(link?.getAttribute('foo:bar')).toBe('baz')
      expect(link?.getAttribute('rel')).toBe('prev next')
    })

    it('joins comma-separated attribute values', () => {
      const input = jsx`
        <input accept={${['image/png', 'image/jpeg']}} />
      ` as HTMLInputElement

      expect(input.getAttribute('accept')).toBe('image/png,image/jpeg')
    })

    it('ignores invalid event prop names from spread objects', () => {
      const strayHandlers = {
        'on:': vi.fn(),
        on: vi.fn(),
        'on:invalid-capture': vi.fn(),
      }

      const button = jsx`
        <button {...${strayHandlers}}>Invalid bindings</button>
      ` as HTMLButtonElement

      button.click()

      Object.values(strayHandlers).forEach(handler => {
        expect(handler).not.toHaveBeenCalled()
      })
    })

    it('validates event listener descriptors and objects', () => {
      const listenerObject = { handleEvent: vi.fn() }
      const descriptorWithoutHandler = { once: true } as Record<string, unknown>
      const descriptorWithObject = { handler: listenerObject, capture: true }

      const button = jsx`
        <button
          onClick={${123 as unknown as () => void}}
          on:missing-handler={${descriptorWithoutHandler as unknown}}
          onMouseDown={${descriptorWithObject}}
          onMouseUp={${listenerObject}}
        />
      ` as HTMLButtonElement

      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

      expect(listenerObject.handleEvent).toHaveBeenCalledTimes(2)
    })

    it('skips style assignment when style targets are unavailable', () => {
      const originalCreateElement = document.createElement
      const spy = vi.spyOn(document, 'createElement').mockImplementation(((
        tagName: string,
        options?: ElementCreationOptions,
      ) => {
        const node = originalCreateElement.call(document, tagName, options)
        if (tagName === 'div') {
          Object.defineProperty(node, 'style', { value: undefined })
        }
        return node
      }) as typeof document.createElement)

      try {
        const element = jsx`<div style={${{ color: 'tomato' }}} />` as HTMLDivElement
        expect(element.getAttribute('style')).toBeNull()
      } finally {
        spy.mockRestore()
      }
    })

    it('sets must-use properties directly on the DOM element', () => {
      const input = jsx`<input checked={${true}} />` as HTMLInputElement
      expect(input.checked).toBe(true)
    })

    it('handles overloaded boolean and false attribute serialization', () => {
      const enabled =
        jsx`<a download={${false}} data-flag={${false}} />` as HTMLAnchorElement
      const forced = jsx`<a download={${true}} />` as HTMLAnchorElement

      expect(enabled.hasAttribute('download')).toBe(false)
      expect(enabled.hasAttribute('data-flag')).toBe(false)
      expect(forced.getAttribute('download')).toBe('')
    })

    it('omits null and boolean children when rendering', () => {
      const list = jsx`
        <ul>
          {${[null, undefined, false, 'visible']}}
        </ul>
      ` as HTMLUListElement

      expect(list.textContent).toBe('visible')
    })

    it('supports shorthand attributes for boolean props', () => {
      const element = jsx`
        <div hidden />
      ` as HTMLDivElement

      expect(element.hasAttribute('hidden')).toBe(true)
    })

    it('keeps working when global Node is temporarily unavailable', () => {
      const originalNode = globalThis.Node
      ;(globalThis as { Node?: typeof Node }).Node = undefined as never

      try {
        const element = jsx`<div>text fallback</div>` as HTMLDivElement
        expect(element.textContent).toBe('text fallback')
      } finally {
        ;(globalThis as { Node?: typeof Node }).Node = originalNode
      }
    })
  })

  describe('dev diagnostics', () => {
    let warnSpy: ReturnType<typeof vi.spyOn> | null = null

    beforeEach(() => {
      enableJsxDebugDiagnostics({ mode: 'always' })
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    })

    afterEach(() => {
      warnSpy?.mockRestore()
      warnSpy = null
      disableJsxDebugDiagnostics()
    })

    it('suggests camelCase names for lowercase DOM events', () => {
      const element = jsx`<button onclick={${() => {}}} />` as HTMLButtonElement

      expect(element).toBeInstanceOf(HTMLButtonElement)
      expect(warnSpy).not.toBeNull()
      expect(warnSpy?.mock.calls.some(call => call[0]?.includes('onclick'))).toBe(true)
    })

    it('throws when event handlers are not functions or descriptors', () => {
      expect(() => jsx`<button onClick={${'not-a-function'}} />`).toThrow(/onClick/)
    })

    it('throws when dangerouslySetInnerHTML is missing a string __html field', () => {
      expect(() => jsx`<div dangerouslySetInnerHTML={${{}}} />`).toThrow(
        /dangerouslySetInnerHTML/,
      )

      expect(() => jsx`<div dangerouslySetInnerHTML={${{ __html: 123 }}} />`).toThrow(
        /dangerouslySetInnerHTML/,
      )
    })
  })
})
