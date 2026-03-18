import { describe, expect, it } from 'vitest'

import { transformJsxSource } from '../src/transform.js'
import { transpileJsxSource } from '../src/transpile.js'

describe('transformJsxSource()', () => {
  it('produces deterministic import metadata snapshots', () => {
    const input = `
import React, { useMemo as memo, type FC } from 'react'
import * as Theme from '@app/theme'
import type { Palette } from './palette'
import './app.css'

const App: FC<Palette> = () => <div>{memo(() => Theme, [])}</div>
`

    const first = transformJsxSource(input, { typescript: 'strip' })
    const second = transformJsxSource(input, { typescript: 'strip' })

    expect(first.imports).toEqual(second.imports)
    expect(first.imports).toMatchSnapshot()
  })

  it('produces a stable parser diagnostics snapshot shape', () => {
    const result = transformJsxSource('import {')
    const normalizedDiagnostics = result.diagnostics.map(diagnostic => ({
      ...diagnostic,
      codeframe: diagnostic.codeframe ? '<codeframe>' : null,
    }))

    expect(normalizedDiagnostics).toMatchSnapshot()
  })

  it('matches transpile output in preserve mode', () => {
    const input = `
const App = () => (
  <>
    <button className="button">click me</button>
  </>
)
`

    const transformed = transformJsxSource(input)
    const transpiled = transpileJsxSource(input)

    expect(transformed.code).toBe(transpiled.code)
    expect(transformed.changed).toBe(transpiled.changed)
    expect(transformed.imports).toEqual([])
    expect(transformed.diagnostics).toEqual([])
  })

  it('returns parser diagnostics with source ranges', () => {
    const input = 'import {'

    const result = transformJsxSource(input)

    expect(result.changed).toBe(false)
    expect(result.code).toBe(input)
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.source).toBe('parser')
    expect(result.diagnostics[0]?.range).toEqual([8, 8])
  })

  it('extracts normalized import metadata in declaration order', () => {
    const input = `
import React, { useState as useAlias, type FC } from 'react'
import * as Shared from '@scope/shared'
import type { Props } from './types'
import './styles.css'

const App: FC<Props> = () => <button>{useAlias}</button>
`

    const result = transformJsxSource(input, { typescript: 'strip' })

    expect(result.diagnostics).toEqual([])
    expect(result.imports).toMatchObject([
      {
        source: 'react',
        importKind: 'value',
        sideEffectOnly: false,
        bindings: [
          {
            kind: 'default',
            local: 'React',
            imported: 'default',
            isTypeOnly: false,
          },
          {
            kind: 'named',
            local: 'useAlias',
            imported: 'useState',
            isTypeOnly: false,
          },
          {
            kind: 'named',
            local: 'FC',
            imported: 'FC',
            isTypeOnly: true,
          },
        ],
      },
      {
        source: '@scope/shared',
        importKind: 'value',
        sideEffectOnly: false,
        bindings: [
          {
            kind: 'namespace',
            local: 'Shared',
            imported: '*',
            isTypeOnly: false,
          },
        ],
      },
      {
        source: './types',
        importKind: 'type',
        sideEffectOnly: false,
        bindings: [
          {
            kind: 'named',
            local: 'Props',
            imported: 'Props',
            isTypeOnly: true,
          },
        ],
      },
      {
        source: './styles.css',
        importKind: 'value',
        sideEffectOnly: true,
        bindings: [],
      },
    ])

    expect(result.imports.every(entry => entry.range !== null)).toBe(true)
    expect(result.imports[0]?.bindings.every(binding => binding.range !== null)).toBe(
      true,
    )
  })

  it('uses oxc-transform strip backend by default', () => {
    const input = `
type Props = { label: string }
const Button = ({ label }: Props): unknown => <button>{label as string}</button>
`

    const result = transformJsxSource(input, {
      sourceType: 'script',
      typescript: 'strip',
    })

    expect(result.diagnostics).toEqual([])
    expect(result.code).not.toContain('type Props =')
    expect(result.code).not.toContain(': Props')
    expect(result.code).toContain('React.createElement("button", null, label)')
    expect(() => new Function(result.code)).not.toThrow()
  })

  it('supports manual strip backend for side-by-side parity checks', () => {
    const input = `
type Value = string
const value = (input satisfies string)
`

    const result = transformJsxSource(input, {
      sourceType: 'script',
      typescript: 'strip',
      typescriptStripBackend: 'transpile-manual',
    })

    expect(result.diagnostics).toEqual([])
    expect(result.code).not.toContain('type Value =')
    expect(result.code).not.toContain('satisfies string')
    expect(() => new Function(result.code)).not.toThrow()
  })
})
