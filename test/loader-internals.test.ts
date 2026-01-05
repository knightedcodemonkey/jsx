import { describe, it, expect } from 'vitest'
import MagicString from 'magic-string'

import { parseRangeKey } from '../src/loader/helpers/parse-range-key.js'
import { materializeSlice } from '../src/loader/helpers/materialize-slice.js'
import { rewriteImportsWithoutTags } from '../src/loader/helpers/rewrite-imports-without-tags.js'
import { formatImportSpecifier } from '../src/loader/helpers/format-import-specifier.js'

describe('loader internals', () => {
  describe('parseRangeKey', () => {
    it('accepts well-formed ranges', () => {
      expect(parseRangeKey('1:3')).toEqual([1, 3])
    })

    it('rejects ranges where end precedes start', () => {
      expect(parseRangeKey('3:1')).toBeNull()
    })

    it('rejects non-numeric ranges', () => {
      expect(parseRangeKey('a:b')).toBeNull()
    })
  })

  describe('materializeSlice', () => {
    it('applies non-overlapping nested replacements', () => {
      const replacements = new Map<string, string>([
        ['1:3', 'X'],
        ['3:5', 'Y'],
      ])
      const result = materializeSlice(0, 6, 'abcdef', replacements)
      expect(result).toBe('aXYf')
    })

    it('skips overlapping nested replacements', () => {
      const replacements = new Map<string, string>([
        ['1:4', 'X'],
        ['3:5', 'Y'],
      ])
      const result = materializeSlice(0, 6, 'abcdef', replacements)
      expect(result).toBe('aXef')
    })

    it('returns exact replacement without scanning nested ranges', () => {
      const replacements = new Map<string, string>([['0:4', 'XY']])
      const result = materializeSlice(0, 4, 'abcd', replacements)
      expect(result).toBe('XY')
    })

    it('falls back to raw slice when no replacements exist', () => {
      const result = materializeSlice(1, 3, 'abcd', new Map())
      expect(result).toBe('bc')
    })
  })

  describe('rewriteImportsWithoutTags', () => {
    it('drops default imports matching inline tags', () => {
      const importStatement = 'import jsxTag from "lib"\n'
      const source = `${importStatement}const view = jsxTag` + '`<div />`\n'
      const magic = new MagicString(source)
      const program = {
        body: [
          {
            type: 'ImportDeclaration',
            start: 0,
            end: importStatement.length,
            importKind: 'value',
            source: { raw: '"lib"', start: 19, end: 24 },
            specifiers: [
              {
                type: 'ImportDefaultSpecifier',
                start: 7,
                end: 13,
                local: { name: 'jsxTag' },
              },
            ],
          },
        ],
      }

      const mutated = rewriteImportsWithoutTags(
        program as never,
        magic,
        new Set(['jsxTag']),
        source,
      )

      expect(mutated).toBe(true)
      expect(magic.toString()).not.toContain('import jsxTag')
    })

    it('returns false when no inline tags are provided', () => {
      const magic = new MagicString('import x from "lib"\n')
      const program = {
        body: [
          {
            type: 'ImportDeclaration',
            start: 0,
            end: 21,
            importKind: 'value',
            source: { raw: '"lib"', start: 14, end: 19 },
            specifiers: [
              {
                type: 'ImportDefaultSpecifier',
                start: 7,
                end: 8,
                local: { name: 'x' },
              },
            ],
          },
        ],
      }

      const mutated = rewriteImportsWithoutTags(
        program as never,
        magic,
        new Set(),
        magic.toString(),
      )
      expect(mutated).toBe(false)
    })

    it('rewrites kept bindings and uses slice when raw source is missing', () => {
      const importStatement = 'import { jsxTag as localTag, keepMe } from lib\n'
      const source = `${importStatement}const view = localTag` + '`<div />`\n'
      const magic = new MagicString(source)
      const program = {
        body: [
          {
            type: 'ImportDeclaration',
            start: 0,
            end: importStatement.length,
            importKind: 'value',
            source: { start: 43, end: 46 },
            specifiers: [
              {
                type: 'ImportSpecifier',
                start: 7,
                end: 20,
                imported: { name: 'jsxTag' },
                local: { name: 'localTag' },
              },
              {
                type: 'ImportSpecifier',
                start: 22,
                end: 28,
                imported: { name: 'keepMe' },
                local: { name: 'keepMe' },
              },
            ],
          },
        ],
      }

      const mutated = rewriteImportsWithoutTags(
        program as never,
        magic,
        new Set(['localTag']),
        source,
      )

      expect(mutated).toBe(true)
      const rewritten = magic.toString()
      expect(rewritten).toContain('import { keepMe } from lib')
      expect(rewritten).not.toMatch(/import\s+\{[^}]*localTag[^}]*\}/)
    })
  })

  describe('formatImportSpecifier', () => {
    it('formats default and namespace imports with identifiers', () => {
      expect(
        formatImportSpecifier({
          type: 'ImportDefaultSpecifier',
          local: { name: 'foo' },
        } as never),
      ).toBe('foo')
      expect(
        formatImportSpecifier({
          type: 'ImportNamespaceSpecifier',
          local: { name: 'bar' },
        } as never),
      ).toBe('* as bar')
    })

    it('throws when required identifiers are missing', () => {
      expect(() =>
        formatImportSpecifier({ type: 'ImportDefaultSpecifier', local: {} } as never),
      ).toThrow('default import without a local name')
      expect(() =>
        formatImportSpecifier({ type: 'ImportSpecifier', local: {} } as never),
      ).toThrow('named import without an imported name')
    })

    it('formats named imports and falls back to empty string for unknown nodes', () => {
      expect(
        formatImportSpecifier({
          type: 'ImportSpecifier',
          imported: { name: 'orig' },
          local: { name: 'alias' },
        } as never),
      ).toBe('orig as alias')

      expect(formatImportSpecifier({ type: 'Other' } as never)).toBe('')
    })
  })
})
