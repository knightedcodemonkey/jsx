import { beforeEach, describe, expect, it, vi } from 'vitest'

import { removeGlobals, restoreGlobals, snapshotGlobals } from './helpers/node-globals.js'

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
