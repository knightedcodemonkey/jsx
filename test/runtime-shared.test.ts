import { describe, expect, it } from 'vitest'
import type { OxcError } from 'oxc-parser'
import type {
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  Program,
  Expression,
} from '@oxc-project/types'

import {
  evaluateExpression,
  extractRootNode,
  formatParserError,
  getIdentifierName,
  walkAst,
  type TemplateContext,
} from '../src/runtime/shared.js'

const createDummyContext = (): TemplateContext<() => void> => ({
  source: '',
  placeholders: new Map(),
  components: new Map(),
})

describe('runtime shared helpers', () => {
  it('includes label text and codeframes in parser errors', () => {
    const error = {
      message: 'Unexpected token',
      labels: [{ message: 'near <div>' }],
      codeframe: '> 1 | <div',
    } as unknown as OxcError

    const message = formatParserError(error)
    expect(message).toContain('[oxc-parser] Unexpected token')
    expect(message).toContain('near <div>')
    expect(message).toContain('> 1 | <div')
  })

  it('throws when no JSX root exists in the parsed program', () => {
    const program = { body: [], type: 'Program' } as unknown as Program
    expect(() => extractRootNode(program)).toThrow('single JSX element or fragment')
  })

  it('resolves namespaced, member, and unknown identifier names', () => {
    const namespaced = {
      type: 'JSXNamespacedName',
      namespace: { type: 'JSXIdentifier', name: 'svg' },
      name: { type: 'JSXIdentifier', name: 'path' },
    } as JSXNamespacedName

    const member = {
      type: 'JSXMemberExpression',
      object: { type: 'JSXIdentifier', name: 'UI' },
      property: { type: 'JSXIdentifier', name: 'Button' },
    } as JSXMemberExpression

    const fallback = { type: 'NotReal' } as unknown as JSXIdentifier

    expect(getIdentifierName(namespaced)).toBe('svg:path')
    expect(getIdentifierName(member)).toBe('UI.Button')
    expect(getIdentifierName(fallback)).toBe('')
  })

  it('skips nodes without a type when walking the AST', () => {
    const visited: string[] = []
    walkAst({ foo: 'bar' } as never, node => visited.push(node.type))
    expect(visited).toHaveLength(0)
  })

  it('throws when evaluating expressions that lack range data', () => {
    const ctx = createDummyContext()
    const expression = { type: 'Identifier', name: '__KX_EXPR__' } as Expression

    expect(() => evaluateExpression(expression, ctx, () => null)).toThrow(
      'missing source range information',
    )
  })
})
