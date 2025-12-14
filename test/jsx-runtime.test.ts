import { describe, expect, it } from 'vitest'

import { Fragment, jsx, jsxDEV, jsxs } from '../src/jsx-runtime.js'

const diagnosticOnlyMessage =
  'The automatic JSX runtime is only published for TypeScript diagnostics. Render DOM nodes through the jsx tagged template exported by @knighted/jsx instead.'

describe('@knighted/jsx/jsx-runtime', () => {
  it.each([
    ['jsx', () => jsx([] as unknown as TemplateStringsArray)],
    ['jsxs', () => jsxs([] as unknown as TemplateStringsArray)],
    [
      'jsxDEV',
      () =>
        jsxDEV(
          [] as unknown as TemplateStringsArray,
          undefined,
          undefined,
          false,
          undefined,
          undefined,
        ),
    ],
  ])('throws when %s is invoked at runtime', (_, invoke) => {
    expect(invoke).toThrowError(diagnosticOnlyMessage)
  })

  it('exposes a stable Fragment symbol', () => {
    expect(typeof Fragment).toBe('symbol')
    expect(Fragment.description).toBe('@knighted/jsx/jsx-runtime::Fragment')
    expect(Symbol.for('@knighted/jsx/jsx-runtime::Fragment')).toBe(Fragment)
  })
})
