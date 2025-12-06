import { beforeEach, describe, expect, it, vi } from 'vitest'

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

type GlobalKey = (typeof GLOBAL_KEYS)[number]
type SnapshotEntry = { exists: boolean; value: unknown }

type Snapshot = Map<GlobalKey, SnapshotEntry>

const snapshotGlobals = (): Snapshot => {
  const target = globalThis as Record<string, unknown>
  const snapshot = new Map<GlobalKey, SnapshotEntry>()

  GLOBAL_KEYS.forEach(key => {
    snapshot.set(key, {
      exists: Object.prototype.hasOwnProperty.call(target, key),
      value: target[key],
    })
  })

  return snapshot
}

const removeGlobals = () => {
  const target = globalThis as Record<string, unknown>
  GLOBAL_KEYS.forEach(key => {
    target[key] = undefined
  })
}

const restoreGlobals = (snapshot: Snapshot) => {
  const target = globalThis as Record<string, unknown>

  GLOBAL_KEYS.forEach(key => {
    const entry = snapshot.get(key)
    if (!entry) {
      delete target[key]
      return
    }

    if (!entry.exists) {
      delete target[key]
      return
    }

    target[key] = entry.value
  })
}

describe('node entry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('re-exports jsx when a DOM already exists', async () => {
    const { jsx } = await import('../src/node/index.js')
    const element = jsx`<div data-kind="node-entry" />` as HTMLDivElement

    expect(element.getAttribute('data-kind')).toBe('node-entry')
  })

  it('bootstraps a DOM shim when globals are missing', async () => {
    const snapshot = snapshotGlobals()
    removeGlobals()
    vi.resetModules()

    try {
      const { jsx } = await import('../src/node/index.js')
      const element = jsx`<button>shimmed</button>` as HTMLButtonElement

      expect(element.tagName).toBe('BUTTON')
      expect(globalThis.document).toBeDefined()
      expect(globalThis.window).toBeDefined()
    } finally {
      restoreGlobals(snapshot)
      vi.resetModules()
    }
  })
})
