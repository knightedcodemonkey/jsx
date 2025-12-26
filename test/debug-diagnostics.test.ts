import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { jsx } from '../src/jsx.js'
import {
  disableJsxDebugDiagnostics,
  enableJsxDebugDiagnostics,
} from '../src/debug/diagnostics.js'

describe('debug diagnostics env mode', () => {
  const originalFlag = process.env.KNIGHTED_JSX_DEBUG
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    delete process.env.KNIGHTED_JSX_DEBUG
    disableJsxDebugDiagnostics()
  })

  afterEach(() => {
    warnSpy.mockRestore()
    if (originalFlag === undefined) {
      delete process.env.KNIGHTED_JSX_DEBUG
    } else {
      process.env.KNIGHTED_JSX_DEBUG = originalFlag
    }
    disableJsxDebugDiagnostics()
  })

  it('does not emit warnings in env mode without the flag', () => {
    enableJsxDebugDiagnostics({ mode: 'env' })
    void jsx`<button onclick={${() => {}}} />`
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('emits warnings when the env flag is set', () => {
    process.env.KNIGHTED_JSX_DEBUG = '1'
    enableJsxDebugDiagnostics({ mode: 'env' })
    void jsx`<button onclick={${() => {}}} />`
    expect(warnSpy).toHaveBeenCalled()
  })

  it('stops emitting warnings after disable is called', () => {
    process.env.KNIGHTED_JSX_DEBUG = '1'
    enableJsxDebugDiagnostics({ mode: 'env' })
    disableJsxDebugDiagnostics()
    void jsx`<button onclick={${() => {}}} />`
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
