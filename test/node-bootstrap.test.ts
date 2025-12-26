import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'

const DOM_KEYS = [
  'window',
  'self',
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'DocumentFragment',
  'customElements',
  'Text',
  'Comment',
  'MutationObserver',
  'navigator',
] as const

const originalGlobals = new Map<string, unknown>()

const createShimWindow = (label: string) => {
  const base: Record<string, unknown> = {}
  base.document = {
    label,
    createElement: vi.fn(() => ({ label })),
  }
  base.window = base
  base.self = base
  base.HTMLElement = class {}
  base.Element = class {}
  base.Node = class {}
  base.DocumentFragment = class {}
  base.customElements = {}
  base.Text = class {}
  base.Comment = class {}
  base.MutationObserver = class {}
  base.navigator = {}
  return base as unknown as Window & typeof globalThis
}

const linkedomWindowFactory = vi.fn(() => createShimWindow('linkedom'))
const linkedomParseHTML = vi.fn(() => ({ window: linkedomWindowFactory() }))
const jsdomWindowFactory = vi.fn(() => createShimWindow('jsdom'))

class MockJsdom {
  window: Window & typeof globalThis
  constructor() {
    const windowObj = jsdomWindowFactory()
    if (!windowObj) {
      throw new Error('jsdom factory returned nothing')
    }
    this.window = windowObj
  }
}

type RequireSpecifier = Parameters<NodeJS.Require>[0]

const createMockRequire = () => {
  const handler = vi.fn((specifier: RequireSpecifier) => {
    if (specifier === 'linkedom') {
      return { parseHTML: linkedomParseHTML }
    }

    if (specifier === 'jsdom') {
      return { JSDOM: MockJsdom }
    }

    throw new Error(`Unexpected require: ${specifier}`)
  })

  const mock = handler as unknown as NodeJS.Require
  mock.cache = Object.create(null)
  mock.extensions = Object.create(null)
  mock.main = undefined
  mock.resolve = Object.assign(
    vi.fn(((request: string) => request) as NodeJS.RequireResolve),
    { paths: vi.fn(() => [] as string[]) },
  )

  return mock
}

let currentMockRequire = createMockRequire()

const importBootstrap = async () => {
  const mod = await import('../src/node/bootstrap.ts')
  mod.__setNodeRequireForTesting(currentMockRequire)
  return mod
}

const unsetDomGlobals = () => {
  const target = globalThis as Record<string, unknown>
  DOM_KEYS.forEach(key => {
    target[key] = undefined
  })
}

const restoreOriginalGlobals = () => {
  const target = globalThis as Record<string, unknown>
  DOM_KEYS.forEach(key => {
    const value = originalGlobals.get(key)
    if (value === undefined) {
      delete target[key]
    } else {
      target[key] = value
    }
  })
}

const importEnsureNodeDom = async () => {
  const mod = await importBootstrap()
  return mod.ensureNodeDom
}

const originalShimPref = process.env.KNIGHTED_JSX_NODE_SHIM

beforeAll(() => {
  DOM_KEYS.forEach(key => {
    originalGlobals.set(key, (globalThis as Record<string, unknown>)[key])
  })
})

afterAll(() => {
  restoreOriginalGlobals()
  if (originalShimPref === undefined) {
    delete process.env.KNIGHTED_JSX_NODE_SHIM
  } else {
    process.env.KNIGHTED_JSX_NODE_SHIM = originalShimPref
  }
})

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  unsetDomGlobals()
  delete process.env.KNIGHTED_JSX_NODE_SHIM
  linkedomWindowFactory.mockImplementation(() => createShimWindow('linkedom'))
  linkedomParseHTML.mockImplementation(() => ({ window: linkedomWindowFactory() }))
  jsdomWindowFactory.mockImplementation(() => createShimWindow('jsdom'))
  currentMockRequire = createMockRequire()
})

describe('ensureNodeDom', () => {
  it('bootstraps a DOM shim once using linkedom by default', async () => {
    const ensureNodeDom = await importEnsureNodeDom()
    ensureNodeDom()
    expect(linkedomParseHTML).toHaveBeenCalledTimes(1)
    expect(jsdomWindowFactory).not.toHaveBeenCalled()
    expect(
      globalThis.document && typeof (globalThis.document as Document).createElement,
    ).toBe('function')

    ensureNodeDom()
    expect(linkedomParseHTML).toHaveBeenCalledTimes(1)
  })

  it('prefers jsdom when KNIGHTED_JSX_NODE_SHIM=jsdom', async () => {
    process.env.KNIGHTED_JSX_NODE_SHIM = 'jsdom'
    const ensureNodeDom = await importEnsureNodeDom()
    ensureNodeDom()
    expect(jsdomWindowFactory).toHaveBeenCalledTimes(1)
    expect(linkedomParseHTML).not.toHaveBeenCalled()
  })

  it('throws an aggregate error when no shim can load', async () => {
    const linkedomError = new Error('linkedom-failed')
    const jsdomError = new Error('jsdom-failed')
    linkedomParseHTML.mockImplementation(() => {
      throw linkedomError
    })
    jsdomWindowFactory.mockImplementation(() => {
      throw jsdomError
    })

    const ensureNodeDom = await importEnsureNodeDom()

    expect(() => ensureNodeDom()).toThrow('Unable to bootstrap a DOM-like environment')

    const aggregateError = (() => {
      try {
        ensureNodeDom()
        return null
      } catch (error) {
        return error as AggregateError
      }
    })()

    expect(aggregateError).toBeInstanceOf(AggregateError)
    expect(aggregateError?.errors).toEqual([linkedomError, jsdomError])
  })

  it('short-circuits when a DOM already exists', async () => {
    const documentStub = {
      createElement: vi.fn(),
    } as unknown as Document
    ;(globalThis as Record<string, unknown>).document = documentStub

    const ensureNodeDom = await importEnsureNodeDom()
    ensureNodeDom()

    expect(linkedomParseHTML).not.toHaveBeenCalled()
    expect(jsdomWindowFactory).not.toHaveBeenCalled()
  })
})
