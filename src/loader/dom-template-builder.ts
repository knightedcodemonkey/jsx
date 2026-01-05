import { parseSync, type ParserOptions } from 'oxc-parser'
import type {
  Expression,
  JSXAttribute,
  JSXChild,
  JSXElement,
  JSXFragment,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  Program,
} from '@oxc-project/types'
import {
  formatTaggedTemplateParserError,
  type TemplateDiagnostics,
} from '../internal/template-diagnostics.js'
import { DOM_HELPER_SNIPPETS, type DomHelperKind } from './helpers/dom-snippets.js'

export type TemplatePlaceholder = {
  marker: string
  code: string
}

const TEMPLATE_PARSER_OPTIONS: ParserOptions = {
  lang: 'tsx',
  sourceType: 'module',
  range: true,
  preserveParens: true,
}

type DomCompileResult = {
  code: string
  helpers: Set<DomHelperKind>
}

type Namespace = 'html' | 'svg' | 'math'

const NAMESPACE_URIS: Record<Namespace, string> = {
  html: 'http://www.w3.org/1999/xhtml',
  svg: 'http://www.w3.org/2000/svg',
  math: 'http://www.w3.org/1998/Math/MathML',
}

const createPlaceholderMap = (placeholders: TemplatePlaceholder[]) =>
  new Map(placeholders.map(entry => [entry.marker, entry.code]))

const isLoaderPlaceholderIdentifier = (node: JSXIdentifier | JSXNamespacedName) => {
  const name = (node as JSXIdentifier).name
  return typeof name === 'string' && name.startsWith('__JSX_LOADER')
}

const normalizeDomText = (value: string): string | null => {
  const collapsed = value.replace(/\r/g, '').replace(/\n\s+/g, ' ')
  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? ''
  const trailingWhitespace = value.match(/\s*$/)?.[0] ?? ''
  const trimStart = /\n/.test(leadingWhitespace)
  const trimEnd = /\n/.test(trailingWhitespace)

  let normalized = collapsed
  if (trimStart) {
    normalized = normalized.replace(/^\s+/, '')
  }
  if (trimEnd) {
    normalized = normalized.replace(/\s+$/, '')
  }

  if (normalized.length === 0 || normalized.trim().length === 0) {
    return null
  }

  return normalized
}

class DomTemplateBuilder {
  private placeholderMap: Map<string, string>
  private helpers: Set<DomHelperKind>
  private id = 0

  constructor(placeholderSource: TemplatePlaceholder[]) {
    this.placeholderMap = createPlaceholderMap(placeholderSource)
    this.helpers = new Set<DomHelperKind>()
  }

  compile(root: JSXElement | JSXFragment): DomCompileResult {
    const code = this.compileNode(root, 'html')
    return { code, helpers: this.helpers }
  }

  private nextId(prefix: string) {
    return `__jsxDom_${prefix}_${this.id++}`
  }

  private compileNode(node: JSXElement | JSXFragment, namespace: Namespace): string {
    if (node.type === 'JSXFragment') {
      const fragVar = this.nextId('frag')
      const lines = [`const ${fragVar} = document.createDocumentFragment()`]
      node.children.forEach(child => {
        const childExpr = this.compileChild(child, namespace)
        if (childExpr) {
          this.helpers.add('dom')
          lines.push(`__jsxDomAppend(${fragVar}, ${childExpr})`)
        }
      })
      lines.push(`return ${fragVar}`)
      return `(() => { ${lines.join('; ')} })()`
    }

    const { tagExpr, namespace: tagNs } = this.compileTagName(node.openingElement.name)
    const resolvedNs = tagNs ?? namespace
    const creator =
      resolvedNs === 'html'
        ? `document.createElement(${tagExpr})`
        : `document.createElementNS('${NAMESPACE_URIS[resolvedNs]}', ${tagExpr})`

    const elVar = this.nextId('el')
    const lines = [`const ${elVar} = ${creator}`]

    node.openingElement.attributes.forEach(attr => {
      if (attr.type === 'JSXSpreadAttribute') {
        this.helpers.add('dom')
        const value = this.compileExpression(attr.argument as Expression)
        lines.push(`__jsxDomAssignProps(${elVar}, ${value}, '${resolvedNs}')`)
        return
      }

      const name = this.compileAttributeName(attr.name)
      const valueExpr = this.compileAttributeValue(attr as JSXAttribute)
      if (!valueExpr) {
        /* c8 ignore next */
        return
      }
      this.helpers.add('dom')
      lines.push(`__jsxDomSetProp(${elVar}, ${name}, ${valueExpr}, '${resolvedNs}')`)
    })

    node.children.forEach(child => {
      const childExpr = this.compileChild(child, resolvedNs)
      if (childExpr) {
        this.helpers.add('dom')
        lines.push(`__jsxDomAppend(${elVar}, ${childExpr})`)
      }
    })

    lines.push(`return ${elVar}`)
    return `(() => { ${lines.join('; ')} })()`
  }

  private compileAttributeValue(attr: JSXAttribute): string | null {
    if (!attr.value) {
      return 'true'
    }

    if (attr.value.type === 'Literal') {
      return JSON.stringify(attr.value.value)
    }

    if (attr.value.type === 'JSXExpressionContainer') {
      const expr = attr.value.expression
      if (expr.type === 'JSXEmptyExpression') {
        /* c8 ignore next */
        return null
      }
      return this.compileExpression(expr as Expression)
    }

    /* c8 ignore next */
    return 'undefined'
  }

  private compileAttributeName(
    name: JSXIdentifier | JSXNamespacedName | JSXMemberExpression,
  ): string {
    if (name.type === 'JSXIdentifier') {
      return JSON.stringify(name.name)
    }
    if (name.type === 'JSXNamespacedName') {
      return JSON.stringify(`${name.namespace.name}:${name.name.name}`)
    }
    if (name.type === 'JSXMemberExpression') {
      return JSON.stringify(
        `${this.compileAttributeName(name.object as never).replace(/"/g, '')}.${name.property.name}`,
      )
    }
    /* c8 ignore next */
    return '""'
  }

  private compileChild(child: JSXChild, namespace: Namespace): string | null {
    switch (child.type) {
      case 'JSXText': {
        const text = normalizeDomText(child.value)
        if (!text) return null
        return JSON.stringify(text)
      }
      case 'JSXExpressionContainer': {
        if (child.expression.type === 'JSXEmptyExpression') return null
        return this.compileExpression(child.expression as Expression)
      }
      case 'JSXSpreadChild': {
        return this.compileExpression(child.expression as Expression)
      }
      case 'JSXElement':
      case 'JSXFragment': {
        return this.compileNode(child, namespace)
      }
      default:
        /* c8 ignore next */
        return null
    }
  }

  private compileTagName(name: JSXElement['openingElement']['name']): {
    tagExpr: string
    namespace: Namespace | null
  } {
    if (!name) {
      /* c8 ignore next */
      throw new Error('[jsx-loader] Encountered JSX element without a tag name.')
    }

    if (name.type === 'JSXIdentifier') {
      if (isLoaderPlaceholderIdentifier(name)) {
        const resolved = this.placeholderMap.get(name.name)
        if (!resolved) {
          throw new Error(
            '[jsx-loader] Unable to resolve placeholder for tag expression.',
          )
        }
        return { tagExpr: resolved, namespace: null }
      }
      const tagName = name.name
      const lower = tagName.toLowerCase()
      if (lower === 'svg') return { tagExpr: JSON.stringify(tagName), namespace: 'svg' }
      if (lower === 'math') return { tagExpr: JSON.stringify(tagName), namespace: 'math' }
      return { tagExpr: JSON.stringify(tagName), namespace: null }
    }

    if (name.type === 'JSXMemberExpression') {
      const tagExpr = `${this.compileAttributeName(name.object as never).replace(/"/g, '')}.${name.property.name}`
      return { tagExpr: JSON.stringify(tagExpr), namespace: null }
    }

    if (name.type === 'JSXNamespacedName') {
      const tagExpr = `${name.namespace.name}:${name.name.name}`
      return { tagExpr: JSON.stringify(tagExpr), namespace: null }
    }

    /* c8 ignore next */
    throw new Error('[jsx-loader] Unsupported tag expression in dom mode.')
  }

  private compileExpression(node: Expression | JSXElement | JSXFragment): string {
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      return this.compileNode(node, 'html')
    }

    if (node.type === 'Identifier') {
      const resolved = this.placeholderMap.get(node.name as string)
      if (resolved) return resolved
      return node.name as string
    }

    if (node.type === 'Literal') {
      return JSON.stringify((node as { value: unknown }).value)
    }

    if ('range' in node && Array.isArray(node.range)) {
      throw new Error('[jsx-loader] Unable to inline complex expressions in dom mode.')
    }

    /* c8 ignore next */
    throw new Error('[jsx-loader] Unable to compile expression for dom mode.')
  }
}

export const compileDomTemplate = (
  templateSource: string,
  placeholders: TemplatePlaceholder[],
  resourcePath: string,
  tagName: string,
  templates: TemplateStringsArray,
  diagnostics: TemplateDiagnostics,
): DomCompileResult => {
  const parsed = parseSync(
    `${resourcePath}?jsx-dom-template`,
    templateSource,
    TEMPLATE_PARSER_OPTIONS,
  )

  if (parsed.errors.length > 0) {
    throw new Error(
      formatTaggedTemplateParserError(
        tagName,
        templates,
        diagnostics,
        parsed.errors[0]!,
        {
          label: 'jsx-loader',
        },
      ),
    )
  }

  const root = extractJsxRoot(parsed.program)
  const builder = new DomTemplateBuilder(placeholders)
  return builder.compile(root)
}

const extractJsxRoot = (program: Program): JSXElement | JSXFragment => {
  for (const statement of program.body) {
    if (statement.type === 'ExpressionStatement') {
      const expression = statement.expression
      if (expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
        return expression
      }
    }
  }

  throw new Error('[jsx-loader] Expected the template to contain a single JSX root node.')
}

export { DOM_HELPER_SNIPPETS }
