import { describe, expect, it, vi } from 'vitest'

import { transformJsxSource } from '../src/transform.js'
import { transpileJsxSource } from '../src/transpile.js'

type ManualStripBackendOptions = Parameters<typeof transformJsxSource>[1] & {
  typescriptStripBackend: 'transpile-manual'
}

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
    expect(transformed.declarations).toBeUndefined()
    expect(transformed.hasTopLevelJsxExpression).toBeUndefined()
  })

  it('collects top-level JSX expression metadata when requested', () => {
    const input = '(<button type="button">hello</button>) as any; // trailing'

    const result = transformJsxSource(input, {
      collectTopLevelJsxExpression: true,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.hasTopLevelJsxExpression).toBe(true)
    expect(result.topLevelJsxExpressionRange).toHaveLength(2)
    const [start, end] = result.topLevelJsxExpressionRange as [number, number]
    expect(input.slice(start, end)).toBe('<button type="button">hello</button>')
  })

  it('reports false top-level JSX expression metadata when absent', () => {
    const input = 'const App = () => <button>ok</button>'

    const result = transformJsxSource(input, {
      collectTopLevelJsxExpression: true,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.hasTopLevelJsxExpression).toBe(false)
    expect(result.topLevelJsxExpressionRange).toBeNull()
  })

  it('collects top-level declarations when requested', () => {
    const input = `
const LocalArrow = () => <button>arrow</button>
const LocalFunctionExpr = function named() { return null }
const LocalClassExpr = class Named {}
const LocalValue = 42
function LocalFn() { return <LocalArrow /> }
class LocalClass {}
export const ExportedArrow = () => <button>exported</button>
export function ExportedFn() { return <ExportedArrow /> }
export default function App() { return <ExportedArrow /> }
`

    const result = transformJsxSource(input, {
      collectTopLevelDeclarations: true,
      typescript: 'strip',
    })

    expect(result.diagnostics).toEqual([])
    expect(result.declarations).toHaveLength(9)
    expect(result.declarations).toEqual([
      {
        name: 'LocalArrow',
        kind: 'variable',
        exportKind: 'none',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: 'arrow-function',
      },
      {
        name: 'LocalFunctionExpr',
        kind: 'variable',
        exportKind: 'none',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: 'function-expression',
      },
      {
        name: 'LocalClassExpr',
        kind: 'variable',
        exportKind: 'none',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: 'class-expression',
      },
      {
        name: 'LocalValue',
        kind: 'variable',
        exportKind: 'none',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: 'other',
      },
      {
        name: 'LocalFn',
        kind: 'function',
        exportKind: 'none',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: null,
      },
      {
        name: 'LocalClass',
        kind: 'class',
        exportKind: 'none',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: null,
      },
      {
        name: 'ExportedArrow',
        kind: 'variable',
        exportKind: 'named',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: 'arrow-function',
      },
      {
        name: 'ExportedFn',
        kind: 'function',
        exportKind: 'named',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: null,
      },
      {
        name: 'App',
        kind: 'function',
        exportKind: 'default',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: null,
      },
    ])

    expect(result.declarations?.every(declaration => declaration.range !== null)).toBe(
      true,
    )
    expect(
      result.declarations?.every(declaration => declaration.statementRange !== null),
    ).toBe(true)
  })

  it('collects top-level declarations for all valid identifier naming styles', () => {
    const input = `
const camelCase = () => null
const snake_case = () => null
const $dollar = () => null
const _underscore = () => null
function lowerFn() { return null }
`

    const result = transformJsxSource(input, {
      collectTopLevelDeclarations: true,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.declarations).toHaveLength(5)
    expect(result.declarations).toEqual([
      {
        name: 'camelCase',
        kind: 'variable',
        exportKind: 'none',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: 'arrow-function',
      },
      {
        name: 'snake_case',
        kind: 'variable',
        exportKind: 'none',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: 'arrow-function',
      },
      {
        name: '$dollar',
        kind: 'variable',
        exportKind: 'none',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: 'arrow-function',
      },
      {
        name: '_underscore',
        kind: 'variable',
        exportKind: 'none',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: 'arrow-function',
      },
      {
        name: 'lowerFn',
        kind: 'function',
        exportKind: 'none',
        range: expect.any(Array),
        statementRange: expect.any(Array),
        initializerKind: null,
      },
    ])
  })

  it('returns a declarations array on parser-error paths when requested', () => {
    const input = 'const App = () => <button>ok</button>\nimport {'

    const result = transformJsxSource(input, {
      collectTopLevelDeclarations: true,
    })

    expect(result.diagnostics[0]?.source).toBe('parser')
    expect(Array.isArray(result.declarations)).toBe(true)
  })

  it('returns JSX expression metadata on parser-error paths when requested', () => {
    const input = 'import {'

    const result = transformJsxSource(input, {
      collectTopLevelJsxExpression: true,
    })

    expect(result.diagnostics[0]?.source).toBe('parser')
    expect(typeof result.hasTopLevelJsxExpression).toBe('boolean')
    expect(result.hasTopLevelJsxExpression).toBe(false)
    expect(result.topLevelJsxExpressionRange).toBeNull()
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
    const internalOptions: ManualStripBackendOptions = {
      sourceType: 'script',
      typescript: 'strip',
      typescriptStripBackend: 'transpile-manual',
    }

    const result = transformJsxSource(input, internalOptions)

    expect(result.diagnostics).toEqual([])
    expect(result.code).not.toContain('type Value =')
    expect(result.code).not.toContain('satisfies string')
    expect(() => new Function(result.code)).not.toThrow()
  })

  it('keeps changed aligned with returned code when transform emits diagnostics', async () => {
    const source = "const value: string = 'ok'"
    vi.resetModules()
    vi.doMock('oxc-transform', () => ({
      transformSync: () => ({
        code: '',
        helpersUsed: {},
        errors: [
          {
            severity: 'Error',
            message: 'mock transform failure',
            labels: [{ start: 0, end: 0 }],
            codeframe: null,
            helpMessage: null,
          },
        ],
      }),
    }))

    const { transformJsxSource: mockedTransformJsxSource } =
      await import('../src/transform.js')

    const result = mockedTransformJsxSource(source, {
      sourceType: 'script',
      typescript: 'strip',
    })

    expect(result.code).toBe(source)
    expect(result.changed).toBe(false)
    expect(result.diagnostics[0]?.source).toBe('transform')

    vi.doUnmock('oxc-transform')
    vi.resetModules()
  })

  it('throws for unsupported sourceType values', () => {
    expect(() =>
      transformJsxSource('const value = 1', {
        sourceType: 'invalid' as unknown as 'module',
      }),
    ).toThrow(/Unsupported sourceType/)
  })

  it('throws for unsupported typescript mode values', () => {
    expect(() =>
      transformJsxSource('const value = 1', {
        typescript: 'erase-all' as unknown as 'preserve',
      }),
    ).toThrow(/Unsupported typescript mode/)
  })

  it('throws for unsupported internal strip backend values', () => {
    const invalidBackendOptions = {
      sourceType: 'script' as const,
      typescript: 'strip' as const,
      typescriptStripBackend: 'unknown-backend',
    } as unknown as Parameters<typeof transformJsxSource>[1]

    expect(() => transformJsxSource('const value = 1', invalidBackendOptions)).toThrow(
      /Unsupported typescriptStripBackend/,
    )
  })

  it('throws for unsupported collectTopLevelDeclarations values', () => {
    expect(() =>
      transformJsxSource('const value = 1', {
        collectTopLevelDeclarations: 'yes' as unknown as boolean,
      }),
    ).toThrow(/Unsupported collectTopLevelDeclarations value/)
  })

  it('throws for unsupported collectTopLevelJsxExpression values', () => {
    expect(() =>
      transformJsxSource('const value = 1', {
        collectTopLevelJsxExpression: 'yes' as unknown as boolean,
      }),
    ).toThrow(/Unsupported collectTopLevelJsxExpression value/)
  })

  it('normalizes import metadata even when range fields are missing', async () => {
    vi.resetModules()
    vi.doMock('oxc-parser', () => ({
      parseSync: () => ({
        errors: [],
        program: {
          body: [
            {
              type: 'ImportDeclaration',
              source: { value: 'pkg' },
              importKind: 'type',
              specifiers: [
                {
                  type: 'ImportSpecifier',
                  imported: { name: 'Thing' },
                  local: { name: 'Thing' },
                  importKind: 'value',
                },
              ],
            },
          ],
        },
      }),
    }))

    const { transformJsxSource: mockedTransformJsxSource } =
      await import('../src/transform.js')

    const result = mockedTransformJsxSource('const value = 1')

    expect(result.imports).toHaveLength(1)
    expect(result.imports[0]?.range).toBeNull()
    expect(result.imports[0]?.bindings[0]?.range).toBeNull()
    expect(result.imports[0]?.importKind).toBe('type')
    expect(result.imports[0]?.bindings[0]?.isTypeOnly).toBe(true)

    vi.doUnmock('oxc-parser')
    vi.resetModules()
  })

  it('normalizes declaration metadata with mixed export wrappers and missing ranges', async () => {
    vi.resetModules()
    vi.doMock('oxc-parser', () => ({
      parseSync: () => ({
        errors: [],
        program: {
          body: [
            {
              type: 'ExportNamedDeclaration',
              declaration: {
                type: 'VariableDeclaration',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: { type: 'Identifier', name: 'namedNoInit' },
                  },
                ],
              },
            },
            {
              type: 'ExportDefaultDeclaration',
              declaration: {
                type: 'FunctionDeclaration',
                id: { type: 'Identifier', name: 'DefaultFn' },
              },
            },
            {
              type: 'ExportDefaultDeclaration',
              declaration: {
                type: 'ClassDeclaration',
                id: { type: 'Identifier', name: 'DefaultClass' },
              },
            },
            {
              type: 'ExportDefaultDeclaration',
              declaration: {
                type: 'FunctionDeclaration',
                id: null,
              },
            },
            {
              type: 'VariableDeclaration',
              declarations: [
                null,
                {
                  type: 'VariableDeclarator',
                  id: { type: 'ObjectPattern' },
                  init: { type: 'ArrowFunctionExpression' },
                },
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: 'classExprValue' },
                  init: { type: 'ClassExpression' },
                },
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: 'otherInitValue' },
                  init: { type: 'CallExpression' },
                },
              ],
            },
            {
              type: 'ExpressionStatement',
            },
            {
              type: 'ExportNamedDeclaration',
              declaration: null,
            },
            {
              type: 'ExportDefaultDeclaration',
              declaration: null,
            },
          ],
        },
      }),
    }))

    const { transformJsxSource: mockedTransformJsxSource } =
      await import('../src/transform.js')

    const result = mockedTransformJsxSource('const value = 1', {
      collectTopLevelDeclarations: true,
    })

    expect(result.declarations).toHaveLength(5)
    expect(result.declarations).toEqual([
      {
        name: 'namedNoInit',
        kind: 'variable',
        exportKind: 'named',
        initializerKind: null,
        range: null,
        statementRange: null,
      },
      {
        name: 'DefaultFn',
        kind: 'function',
        exportKind: 'default',
        initializerKind: null,
        range: null,
        statementRange: null,
      },
      {
        name: 'DefaultClass',
        kind: 'class',
        exportKind: 'default',
        initializerKind: null,
        range: null,
        statementRange: null,
      },
      {
        name: 'classExprValue',
        kind: 'variable',
        exportKind: 'none',
        initializerKind: 'class-expression',
        range: null,
        statementRange: null,
      },
      {
        name: 'otherInitValue',
        kind: 'variable',
        exportKind: 'none',
        initializerKind: 'other',
        range: null,
        statementRange: null,
      },
    ])

    vi.doUnmock('oxc-parser')
    vi.resetModules()
  })

  it('returns an empty declarations array when parser body is not an array', async () => {
    vi.resetModules()
    vi.doMock('oxc-parser', () => ({
      parseSync: () => ({
        errors: [],
        program: {
          body: null,
        },
      }),
    }))

    const { transformJsxSource: mockedTransformJsxSource } =
      await import('../src/transform.js')

    const result = mockedTransformJsxSource('const value = 1', {
      collectTopLevelDeclarations: true,
    })

    expect(result.declarations).toEqual([])

    vi.doUnmock('oxc-parser')
    vi.resetModules()
  })

  it('returns false for JSX expression metadata when parser body is not an array', async () => {
    vi.resetModules()
    vi.doMock('oxc-parser', () => ({
      parseSync: () => ({
        errors: [],
        program: {
          body: null,
        },
      }),
    }))

    const { transformJsxSource: mockedTransformJsxSource } =
      await import('../src/transform.js')

    const result = mockedTransformJsxSource('const value = 1', {
      collectTopLevelJsxExpression: true,
    })

    expect(result.hasTopLevelJsxExpression).toBe(false)
    expect(result.topLevelJsxExpressionRange).toBeNull()

    vi.doUnmock('oxc-parser')
    vi.resetModules()
  })

  it('detects top-level JSX expressions through TS/parens wrappers', async () => {
    vi.resetModules()
    vi.doMock('oxc-parser', () => ({
      parseSync: () => ({
        errors: [],
        program: {
          body: [
            {
              type: 'ExpressionStatement',
              expression: {
                type: 'ParenthesizedExpression',
                expression: {
                  type: 'TSAsExpression',
                  expression: {
                    type: 'JSXFragment',
                  },
                },
              },
            },
          ],
        },
      }),
    }))

    const { transformJsxSource: mockedTransformJsxSource } =
      await import('../src/transform.js')

    const result = mockedTransformJsxSource('const value = 1', {
      collectTopLevelJsxExpression: true,
    })

    expect(result.hasTopLevelJsxExpression).toBe(true)
    expect(result.topLevelJsxExpressionRange).toBeNull()

    vi.doUnmock('oxc-parser')
    vi.resetModules()
  })

  it('marks sideEffectOnly only for value imports with no bindings', async () => {
    vi.resetModules()
    vi.doMock('oxc-parser', () => ({
      parseSync: () => ({
        errors: [],
        program: {
          body: [
            {
              type: 'ImportDeclaration',
              source: { value: './value-side-effect' },
              importKind: 'value',
              specifiers: [],
            },
            {
              type: 'ImportDeclaration',
              source: { value: './type-side-effect' },
              importKind: 'type',
              specifiers: [],
            },
          ],
        },
      }),
    }))

    const { transformJsxSource: mockedTransformJsxSource } =
      await import('../src/transform.js')

    const result = mockedTransformJsxSource('const value = 1')

    expect(result.imports).toMatchObject([
      {
        source: './value-side-effect',
        importKind: 'value',
        sideEffectOnly: true,
      },
      {
        source: './type-side-effect',
        importKind: 'type',
        sideEffectOnly: false,
      },
    ])

    vi.doUnmock('oxc-parser')
    vi.resetModules()
  })
})
