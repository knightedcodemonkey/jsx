import { afterEach, describe, expect, it, vi } from 'vitest'

describe('debug entry modules', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('enables diagnostics when importing the debug entry', async () => {
    const enable = vi.fn()
    const jsxSymbol = Symbol('jsx')

    vi.doMock('../src/debug/diagnostics.js', () => ({
      enableJsxDebugDiagnostics: enable,
    }))
    vi.doMock('../src/jsx.js', () => ({ jsx: jsxSymbol }))

    const mod = await import('../src/debug/index.js')
    expect(enable).toHaveBeenCalledWith({ mode: 'always' })
    expect(mod.jsx).toBe(jsxSymbol)
  })

  it('enables diagnostics and ensures a DOM shim for the node debug entry', async () => {
    const enable = vi.fn()
    const ensureNodeDom = vi.fn()
    const jsxSymbol = Symbol('node-jsx')

    vi.doMock('../src/debug/diagnostics.js', () => ({
      enableJsxDebugDiagnostics: enable,
    }))
    vi.doMock('../src/node/bootstrap.js', () => ({ ensureNodeDom }))
    vi.doMock('../src/jsx.js', () => ({ jsx: jsxSymbol }))

    const mod = await import('../src/node/debug/index.js')
    expect(enable).toHaveBeenCalledWith({ mode: 'always' })
    expect(ensureNodeDom).toHaveBeenCalled()
    expect(mod.jsx).toBe(jsxSymbol)
  })
})
