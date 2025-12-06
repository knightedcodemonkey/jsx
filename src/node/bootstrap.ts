type ShimWindow = Window & typeof globalThis

type ShimLoader = () => Promise<ShimWindow>

type ShimPreference = 'auto' | 'linkedom' | 'jsdom'

const DOM_TEMPLATE = '<!doctype html><html><body></body></html>'
const GLOBAL_KEYS = [
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

const hasDom = () =>
  typeof document !== 'undefined' && typeof document.createElement === 'function'

const assignGlobalTargets = (windowObj: ShimWindow) => {
  const target = globalThis as Record<string, unknown>
  const source = windowObj as unknown as Record<string, unknown>

  GLOBAL_KEYS.forEach(key => {
    if (target[key] === undefined && source[key] !== undefined) {
      target[key] = source[key]
    }
  })
}

const loadLinkedom: ShimLoader = async () => {
  const { parseHTML } = await import('linkedom')
  const { window } = parseHTML(DOM_TEMPLATE)
  return window as unknown as ShimWindow
}

const loadJsdom: ShimLoader = async () => {
  const { JSDOM } = await import('jsdom')
  const { window } = new JSDOM(DOM_TEMPLATE)
  return window as unknown as ShimWindow
}

const parsePreference = (): ShimPreference => {
  const value =
    typeof process !== 'undefined' && process.env?.KNIGHTED_JSX_NODE_SHIM
      ? process.env.KNIGHTED_JSX_NODE_SHIM.toLowerCase()
      : undefined

  if (value === 'linkedom' || value === 'jsdom') {
    return value
  }

  return 'auto'
}

const selectLoaders = (): ShimLoader[] => {
  const pref = parsePreference()

  if (pref === 'linkedom') {
    return [loadLinkedom, loadJsdom]
  }

  if (pref === 'jsdom') {
    return [loadJsdom, loadLinkedom]
  }

  return [loadLinkedom, loadJsdom]
}

const createShimWindow = async () => {
  const errors: unknown[] = []

  for (const loader of selectLoaders()) {
    try {
      return await loader()
    } catch (error) {
      errors.push(error)
    }
  }

  const help =
    'Unable to bootstrap a DOM-like environment. Install "linkedom" or "jsdom" (both optional peer dependencies) or set KNIGHTED_JSX_NODE_SHIM to pick one explicitly.'

  throw new AggregateError(errors, help)
}

let bootstrapPromise: Promise<void> | null = null

export const ensureNodeDom = async () => {
  if (hasDom()) {
    return
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const windowObj = await createShimWindow()
      assignGlobalTargets(windowObj)
    })().catch(error => {
      bootstrapPromise = null
      throw error
    })
  }

  return bootstrapPromise
}
