import type MagicString from 'magic-string'
import type { Program } from '@oxc-project/types'

import { formatImportSpecifier } from './format-import-specifier.js'

type AnyNode = {
  type: string
  [key: string]: unknown
}

export const rewriteImportsWithoutTags = (
  program: Program,
  magic: MagicString,
  inlineTagNames: Set<string>,
  originalSource: string,
) => {
  if (!inlineTagNames.size) {
    return false
  }

  let mutated = false

  program.body.forEach(node => {
    if (node.type !== 'ImportDeclaration') {
      return
    }

    const specifiers = node.specifiers as unknown as AnyNode[]
    const kept: AnyNode[] = []
    let removed = false

    specifiers.forEach(spec => {
      const localName = (spec as { local?: { name?: string } }).local?.name as
        | string
        | undefined
      if (!localName) {
        kept.push(spec)
        return
      }

      const shouldDrop = inlineTagNames.has(localName)

      if (shouldDrop) {
        removed = true
        return
      }

      kept.push(spec)
    })

    if (!removed) {
      return
    }

    if (!kept.length) {
      magic.remove(node.start as number, node.end as number)
      mutated = true
      return
    }

    const keyword = node.importKind === 'type' ? 'import type' : 'import'
    const bindings: string[] = []
    const defaultSpec = kept.find(spec => spec.type === 'ImportDefaultSpecifier')
    const namespaceSpec = kept.find(spec => spec.type === 'ImportNamespaceSpecifier')
    const namedSpecs = kept.filter(spec => spec.type === 'ImportSpecifier')

    if (defaultSpec) {
      bindings.push(formatImportSpecifier(defaultSpec))
    }

    if (namespaceSpec) {
      bindings.push(formatImportSpecifier(namespaceSpec))
    }

    if (namedSpecs.length) {
      bindings.push(`{ ${namedSpecs.map(formatImportSpecifier).join(', ')} }`)
    }

    const sourceLiteral = node.source as { raw?: string; start?: number; end?: number }
    const sourceText = sourceLiteral.raw
      ? sourceLiteral.raw
      : originalSource.slice(sourceLiteral.start ?? 0, sourceLiteral.end ?? 0)
    const rewritten = `${keyword} ${bindings.join(', ')} from ${sourceText}`
    magic.overwrite(node.start as number, node.end as number, rewritten)
    mutated = true
  })

  return mutated
}
