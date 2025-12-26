import { describe, it, expect } from 'vitest'
import type { OxcError } from 'oxc-parser'

import { buildTemplate, formatParserError } from '../src/runtime/shared.js'
import { formatTaggedTemplateParserError } from '../src/internal/template-diagnostics.js'

const capture = (strings: TemplateStringsArray, ...values: unknown[]) => {
  void values
  return strings
}

describe('template diagnostics', () => {
  it('maps parser indices back to the template source with a codeframe', () => {
    const templates = capture`
      <button onclick=${0}>Click me</button>
    `
    const build = buildTemplate(templates, [() => undefined])
    const range = build.diagnostics.expressionRanges[0]!

    const error: OxcError = {
      message: 'Unexpected token',
      labels: [
        {
          start: range.sourceStart,
          end: range.sourceEnd,
          message: 'Bad onclick handler',
        },
      ],
      helpMessage: 'Use curly braces for attribute expressions.',
    } as OxcError

    const formatted = formatTaggedTemplateParserError(
      'jsx',
      templates,
      build.diagnostics,
      error,
      { label: 'custom' },
    )

    expect(formatted).toContain('[custom] Unexpected token')
    expect(formatted).toContain('Bad onclick handler')
    expect(formatted).toMatch(/--> jsx template:\d+:\d+/)
    expect(formatted).toContain('onclick=${expr#0}')
    expect(formatted).toContain('Use curly braces for attribute expressions.')
  })

  it('falls back to the plain parser message when labels are missing', () => {
    const templates = capture`<div />`
    const build = buildTemplate(templates, [])

    const formatted = formatTaggedTemplateParserError(
      'jsx',
      templates,
      build.diagnostics,
      { message: 'Boom' } as OxcError,
    )

    expect(formatted).toBe('[oxc-parser] Boom')
  })

  it('formats low-level parser errors with labels, codeframes, and help text', () => {
    const formatted = formatParserError({
      message: 'Oops',
      labels: [{ message: 'Primary label' }],
      codeframe: 'frame contents',
      helpMessage: 'Try again',
    } as OxcError)

    expect(formatted).toContain('[oxc-parser] Oops')
    expect(formatted).toContain('Primary label')
    expect(formatted).toContain('frame contents')
    expect(formatted).toContain('Try again')
  })
})
