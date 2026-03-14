import { describe, expect, it } from 'vitest'

import { transpileJsxSource } from '../src/transpile.js'

describe('transpileJsxSource()', () => {
  it('transpiles raw JSX elements to React.createElement calls', () => {
    const input = `
const App = () => {
  return (
    <button className="button">click me</button>
  )
}
`

    const result = transpileJsxSource(input)

    expect(result.changed).toBe(true)
    expect(result.code).toContain('React.createElement("button"')
    expect(result.code).toContain('"className": "button"')
    expect(result.code).toContain('"click me"')
  })

  it('transpiles nested JSX and fragments', () => {
    const input = `
const View = ({ label }) => (
  <>
    <section>
      <span>{label}</span>
    </section>
  </>
)
`

    const result = transpileJsxSource(input)

    expect(result.changed).toBe(true)
    expect(result.code).toContain('React.createElement(React.Fragment')
    expect(result.code).toContain('React.createElement("section"')
    expect(result.code).toContain('React.createElement("span"')
  })

  it('returns unchanged source when JSX is not present', () => {
    const input = 'const total = 1 + 2'

    const result = transpileJsxSource(input)

    expect(result.changed).toBe(false)
    expect(result.code).toBe(input)
  })

  it('supports custom runtime references', () => {
    const input = 'const node = <div />'

    const result = transpileJsxSource(input, {
      createElement: '__jsxRuntime',
      fragment: '__fragment',
    })

    expect(result.code).toContain('__jsxRuntime("div", null)')
  })

  it('supports script source mode', () => {
    const input = `
function render() {
  return <div />
}
`

    const result = transpileJsxSource(input, { sourceType: 'script' })

    expect(result.changed).toBe(true)
    expect(result.code).toContain('React.createElement("div", null)')
  })

  it('compiles member tags and mixed prop value forms', () => {
    const input = `
const node = <UI.Button disabled data-id={id} label="save" />
`

    const result = transpileJsxSource(input)

    expect(result.changed).toBe(true)
    expect(result.code).toContain(
      'React.createElement(UI.Button, { "disabled": true, "data-id": id, "label": "save" })',
    )
  })

  it('skips empty JSX prop expressions', () => {
    const input = `
const node = <input value={/* intentionally empty */} />
`

    const result = transpileJsxSource(input)

    expect(result.changed).toBe(true)
    expect(result.code).toContain('React.createElement("input", null)')
    expect(result.code).not.toContain('"value"')
  })

  it('transpiles JSX nested inside expression syntax', () => {
    const input = `
const View = ({ cond, items, visible }) => (
  <section>
    {cond ? <A /> : <B />}
    {items.map(item => <Row key={item.id} />)}
    {visible && <Footer />}
  </section>
)
`

    const result = transpileJsxSource(input)

    expect(result.changed).toBe(true)
    expect(result.code).toContain(
      'cond ? React.createElement(A, null) : React.createElement(B, null)',
    )
    expect(result.code).toContain(
      'items.map(item => React.createElement(Row, { "key": item.id }))',
    )
    expect(result.code).toContain('visible && React.createElement(Footer, null)')
    expect(result.code).not.toContain('<A />')
    expect(result.code).not.toContain('<B />')
    expect(result.code).not.toContain('<Row key={item.id} />')
    expect(result.code).not.toContain('<Footer />')
  })

  it('emits null-safe spread props', () => {
    const input = `
const View = ({ maybeNull, maybeUndefined, extra }) => (
  <div {...maybeNull} id="root" {...maybeUndefined} {...extra} />
)
`

    const result = transpileJsxSource(input)

    expect(result.changed).toBe(true)
    expect(result.code).toContain(
      'Object.assign({}, (maybeNull ?? {}), { "id": "root" }, (maybeUndefined ?? {}), (extra ?? {}))',
    )
  })

  it('reports parser failures with jsx-prefixed diagnostics', () => {
    expect(() => transpileJsxSource('const view = <div>')).toThrow(/\[jsx\]/)
  })
})
