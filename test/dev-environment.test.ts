import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  createDevError,
  describeValue,
  emitDevWarning,
  isDevEnvironment,
} from '../src/internal/dev-environment.js'

const setDebugFlag = (value?: string) => {
  if (value === undefined) {
    delete process.env.KNIGHTED_JSX_DEBUG
  } else {
    process.env.KNIGHTED_JSX_DEBUG = value
  }
}

describe('dev environment helpers', () => {
  const originalProcess = globalThis.process

  afterEach(() => {
    setDebugFlag(undefined)
    ;(globalThis as { process?: NodeJS.Process }).process = originalProcess
  })

  it('detects dev mode only when KNIGHTED_JSX_DEBUG=1 and process exists', () => {
    setDebugFlag(undefined)
    ;(globalThis as { process?: NodeJS.Process }).process = undefined as never
    expect(isDevEnvironment()).toBe(false)
    ;(globalThis as { process?: NodeJS.Process }).process = originalProcess
    expect(isDevEnvironment()).toBe(false)

    setDebugFlag('1')
    expect(isDevEnvironment()).toBe(true)
  })

  it('describes values consistently', () => {
    const anonymous = () => {}
    function Named() {}

    expect(describeValue(null)).toBe('null')
    expect(describeValue(undefined)).toBe('undefined')
    expect(describeValue(anonymous)).toBe('function anonymous')
    expect(describeValue(Named)).toBe('function Named')
    expect(describeValue([1, 2])).toBe('array')
    expect(describeValue({})).toBe('object')
    expect(describeValue(new Map())).toBe('Map instance')
    expect(describeValue(42)).toBe('number')
  })

  it('wraps dev errors with the package prefix', () => {
    expect(createDevError('boom').message).toBe('@knighted/jsx: boom')
  })

  describe('emitDevWarning', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      setDebugFlag(undefined)
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    it('skips warnings when not in dev mode and not forced', () => {
      emitDevWarning('skip me')
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('emits warnings when forced even without env flag', () => {
      emitDevWarning('force me', true)
      expect(warnSpy).toHaveBeenCalledWith('@knighted/jsx: force me')
    })

    it('emits warnings when KNIGHTED_JSX_DEBUG=1', () => {
      setDebugFlag('1')
      emitDevWarning('env enabled')
      expect(warnSpy).toHaveBeenCalledWith('@knighted/jsx: env enabled')
    })
  })
})
