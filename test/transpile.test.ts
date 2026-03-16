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

  it('keeps lowercase-root member tags as expressions', () => {
    const input = 'const node = <ui.Button />'

    const result = transpileJsxSource(input)

    expect(result.changed).toBe(true)
    expect(result.code).toContain('React.createElement(ui.Button, null)')
    expect(result.code).not.toContain('"ui".Button')
  })

  it('skips empty JSX child expressions', () => {
    const input = `
const node = <div>{/* intentionally empty */}</div>
`

    const result = transpileJsxSource(input)

    expect(result.changed).toBe(true)
    expect(result.code).toContain('React.createElement("div", null)')
    expect(result.code).not.toContain('intentionally empty')
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

  it('transpiles direct JSX expression containers', () => {
    const input = `
const View = () => <section>{<A />}</section>
`

    const result = transpileJsxSource(input)

    expect(result.changed).toBe(true)
    expect(result.code).toContain(
      'React.createElement("section", null, React.createElement(A, null))',
    )
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

  it('preserves TypeScript syntax by default', () => {
    const input = `
type Props = { label: string }
const Button = ({ label }: Props): unknown => <button>{label}</button>
`

    const result = transpileJsxSource(input, { sourceType: 'script' })

    expect(result.changed).toBe(true)
    expect(result.code).toContain('type Props = { label: string }')
    expect(result.code).toContain('({ label }: Props): unknown =>')
  })

  it('strips TypeScript annotations and type-only declarations when enabled', () => {
    const input = `
type Props = { label: string }
const Button = ({ label }: Props): unknown => <button>{label as string}</button>
const App = () => <Button label={('typed' as string)!} />
`

    const result = transpileJsxSource(input, {
      sourceType: 'script',
      typescript: 'strip',
    })

    expect(result.changed).toBe(true)
    expect(result.code).not.toContain('type Props =')
    expect(result.code).not.toContain(': Props')
    expect(result.code).not.toContain(': unknown')
    expect(result.code).not.toContain(' as string')
    expect(result.code).toContain('React.createElement("button", null, label)')
    expect(result.code).toContain('React.createElement(Button, { "label": (\'typed\') })')
    expect(() => new Function(result.code)).not.toThrow()
  })

  it('strips TypeScript-only syntax even when JSX is absent', () => {
    const input = `
type Value = string
const value = (input satisfies string)
`

    const result = transpileJsxSource(input, {
      sourceType: 'script',
      typescript: 'strip',
    })

    expect(result.changed).toBe(true)
    expect(result.code).not.toContain('type Value =')
    expect(result.code).not.toContain('satisfies string')
    expect(result.code).toContain('const value = (input)')
    expect(() => new Function(result.code)).not.toThrow()
  })

  it('keeps strip mode as no-op when no TypeScript syntax is present', () => {
    const input = 'const sum = 1 + 2'

    const result = transpileJsxSource(input, {
      sourceType: 'script',
      typescript: 'strip',
    })

    expect(result.changed).toBe(false)
    expect(result.code).toBe(input)
  })

  it('strips multiple equal-length wrapper edits', () => {
    const input = `
const alpha = (left as A)
const beta = (right as B)
`

    const result = transpileJsxSource(input, {
      sourceType: 'script',
      typescript: 'strip',
    })

    expect(result.changed).toBe(true)
    expect(result.code).toContain('const alpha = (left)')
    expect(result.code).toContain('const beta = (right)')
    expect(result.code).not.toContain(' as A')
    expect(result.code).not.toContain(' as B')
  })

  it('strips chained TS casts around JSX expressions', () => {
    const input = `
const node = (<Checkbox checked={true} /> as unknown as HTMLElement)
`

    const result = transpileJsxSource(input, {
      sourceType: 'script',
      typescript: 'strip',
    })

    expect(result.changed).toBe(true)
    expect(result.code).toContain(
      'const node = (React.createElement(Checkbox, { "checked": true }))',
    )
    expect(result.code).not.toContain(' as unknown')
    expect(result.code).not.toContain(' as HTMLElement')
    expect(() => new Function(result.code)).not.toThrow()
  })

  it('throws a clear error when strip mode does not converge', () => {
    const input = `
const node = ((((((value as A) as B) as C) as D) as E) as F)
`

    expect(() =>
      transpileJsxSource(input, {
        sourceType: 'script',
        typescript: 'strip',
      }),
    ).toThrow(/TypeScript strip did not converge after 5 passes/)
  })
})
