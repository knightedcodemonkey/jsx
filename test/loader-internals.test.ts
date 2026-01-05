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

    it('throws on overlapping nested replacements', () => {
      const replacements = new Map<string, string>([
        ['1:4', 'X'],
        ['3:5', 'Y'],
      ])
      expect(() => materializeSlice(0, 6, 'abcdef', replacements)).toThrow(
        'Overlapping replacement ranges detected',
      )
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
  })

  describe('formatImportSpecifier', () => {
    it('throws when required identifiers are missing', () => {
      expect(() =>
        formatImportSpecifier({ type: 'ImportDefaultSpecifier', local: {} } as never),
      ).toThrow('default import without a local name')
      expect(() =>
        formatImportSpecifier({ type: 'ImportSpecifier', local: {} } as never),
      ).toThrow('named import without an imported name')
    })
  })
})
