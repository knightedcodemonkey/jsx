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
})
