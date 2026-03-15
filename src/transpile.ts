import MagicString from 'magic-string'
import { parseSync, type ParserOptions, type OxcError } from 'oxc-parser'
import type {
  Expression,
  JSXAttribute,
  JSXChild,
  JSXElement,
  JSXFragment,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  JSXSpreadAttribute,
  Program,
} from '@oxc-project/types'
import { normalizeJsxText } from './shared/normalize-text.js'

type AnyNode = Record<string, unknown>
type SourceRange = [number, number]
type TranspileSourceType = 'module' | 'script'

export type TranspileJsxSourceOptions = {
  sourceType?: TranspileSourceType
  createElement?: string
  fragment?: string
}

export type TranspileJsxSourceResult = {
  code: string
  changed: boolean
}

const createModuleParserOptions = (sourceType: TranspileSourceType): ParserOptions => ({
  lang: 'tsx',
  sourceType,
  range: true,
  preserveParens: true,
})
const formatParserError = (error: OxcError) => {
  let message = `[jsx] ${error.message}`

  if (error.labels?.length) {
    const label = error.labels[0]
    if (label.message) {
      message += `\n${label.message}`
    }
  }

  if (error.codeframe) {
    message += `\n${error.codeframe}`
  }

  return message
}
const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const isSourceRange = (value: unknown): value is SourceRange =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number'
const hasSourceRange = (value: unknown): value is { range: SourceRange } =>
  isObjectRecord(value) && isSourceRange(value.range)
const compareByRangeStartDesc = (
  first: { range: SourceRange },
  second: { range: SourceRange },
) => second.range[0] - first.range[0]

class SourceJsxReactBuilder {
  constructor(
    private readonly source: string,
    private readonly createElementRef: string,
    private readonly fragmentRef: string,
  ) {}

  compile(node: JSXElement | JSXFragment): string {
    return this.compileNode(node)
  }

  private compileNode(node: JSXElement | JSXFragment): string {
    if (node.type === 'JSXFragment') {
      const children = this.compileChildren(node.children)
      return this.buildCreateElement(this.fragmentRef, 'null', children)
    }

    const opening = node.openingElement
    const tagExpr = this.compileTagName(opening.name)
    const propsExpr = this.compileProps(opening.attributes)
    const children = this.compileChildren(node.children)

    return this.buildCreateElement(tagExpr, propsExpr, children)
  }

  private compileChildren(children: JSXChild[]): string[] {
    const compiled: string[] = []

    children.forEach(child => {
      switch (child.type) {
        case 'JSXText': {
          const normalized = normalizeJsxText(child.value)
          if (normalized) {
            compiled.push(JSON.stringify(normalized))
          }
          break
        }
        case 'JSXExpressionContainer': {
          if (child.expression.type === 'JSXEmptyExpression') {
            break
          }
          compiled.push(this.compileExpression(child.expression))
          break
        }
        case 'JSXSpreadChild': {
          compiled.push(this.compileExpression(child.expression))
          break
        }
        case 'JSXElement':
        case 'JSXFragment': {
          compiled.push(this.compileNode(child))
          break
        }
      }
    })

    return compiled
  }

  private compileProps(attributes: (JSXAttribute | JSXSpreadAttribute)[]): string {
    const segments: string[] = []
    let staticEntries: string[] = []

    const flushStatics = () => {
      if (!staticEntries.length) {
        return
      }
      segments.push(`{ ${staticEntries.join(', ')} }`)
      staticEntries = []
    }

    attributes.forEach(attribute => {
      if (attribute.type === 'JSXSpreadAttribute') {
        flushStatics()
        const spreadValue = this.compileExpression(attribute.argument)
        segments.push(`(${spreadValue} ?? {})`)
        return
      }

      const name = this.compileAttributeName(attribute.name)
      let value: string

      if (!attribute.value) {
        value = 'true'
      } else if (attribute.value.type === 'Literal') {
        value = JSON.stringify(attribute.value.value)
      } else if (attribute.value.type === 'JSXExpressionContainer') {
        if (attribute.value.expression.type === 'JSXEmptyExpression') {
          return
        }
        value = this.compileExpression(attribute.value.expression)
      } else {
        value = 'undefined'
      }

      staticEntries.push(`${JSON.stringify(name)}: ${value}`)
    })

    flushStatics()

    if (!segments.length) {
      return 'null'
    }

    if (segments.length === 1) {
      return segments[0] ?? 'null'
    }

    return `Object.assign({}, ${segments.join(', ')})`
  }

  private compileAttributeName(
    name: JSXIdentifier | JSXNamespacedName | JSXMemberExpression,
  ): string {
    switch (name.type) {
      case 'JSXIdentifier':
        return name.name
      case 'JSXNamespacedName':
        return `${name.namespace.name}:${name.name.name}`
      case 'JSXMemberExpression':
        return `${this.compileAttributeName(name.object)}.${name.property.name}`
      default:
        return ''
    }
  }

  private compileTagName(
    name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName | null | undefined,
  ): string {
    if (!name) {
      throw new Error('[jsx] Encountered JSX element without a tag name.')
    }

    if (name.type === 'JSXIdentifier') {
      if (/^[A-Z]/.test(name.name)) {
        return name.name
      }
      return JSON.stringify(name.name)
    }

    if (name.type === 'JSXMemberExpression') {
      return `${this.compileTagName(name.object)}.${name.property.name}`
    }

    if (name.type === 'JSXNamespacedName') {
      return JSON.stringify(`${name.namespace.name}:${name.name.name}`)
    }

    throw new Error('[jsx] Unsupported JSX tag expression.')
  }

  private compileExpression(node: Expression | JSXElement | JSXFragment): string {
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      return this.compileNode(node)
    }

    if (!hasSourceRange(node)) {
      throw new Error('[jsx] Unable to read source range for expression node.')
    }

    const range = node.range
    const nestedJsxRoots = collectRootJsxNodes(node)
    if (!nestedJsxRoots.length) {
      return this.source.slice(range[0], range[1])
    }

    const expressionSource = this.source.slice(range[0], range[1])
    const magic = new MagicString(expressionSource)

    nestedJsxRoots.sort(compareByRangeStartDesc).forEach(jsxNode => {
      magic.overwrite(
        jsxNode.range[0] - range[0],
        jsxNode.range[1] - range[0],
        this.compileNode(jsxNode),
      )
    })

    return magic.toString()
  }

  private buildCreateElement(type: string, props: string, children: string[]) {
    const args: string[] = [type, props]
    if (children.length) {
      args.push(children.join(', '))
    }
    return `${this.createElementRef}(${args.join(', ')})`
  }
}

const collectRootJsxNodes = (root: Program | Expression | JSXElement | JSXFragment) => {
  const nodes: Array<(JSXElement | JSXFragment) & { range: SourceRange }> = []
  const isJsxElementOrFragment = (node: unknown): node is JSXElement | JSXFragment => {
    if (!isObjectRecord(node)) {
      return false
    }

    return node.type === 'JSXElement' || node.type === 'JSXFragment'
  }

  const walk = (value: unknown, insideJsx: boolean) => {
    if (!isObjectRecord(value)) {
      return
    }

    if (Array.isArray(value)) {
      value.forEach(entry => walk(entry, insideJsx))
      return
    }

    const node: AnyNode = value
    const isJsxNode = isJsxElementOrFragment(node)

    if (isJsxNode && hasSourceRange(node) && !insideJsx) {
      nodes.push(node)
    }

    for (const entry of Object.values(node)) {
      walk(entry, insideJsx || isJsxNode)
    }
  }

  walk(root, false)
  return nodes
}

export function transpileJsxSource(
  source: string,
  options: TranspileJsxSourceOptions = {},
): TranspileJsxSourceResult {
  const sourceType = options.sourceType ?? 'module'
  const createElementRef = options.createElement ?? 'React.createElement'
  const fragmentRef = options.fragment ?? 'React.Fragment'

  const parsed = parseSync(
    'transpile-jsx-source.tsx',
    source,
    createModuleParserOptions(sourceType),
  )

  const firstError = parsed.errors[0]
  if (firstError) {
    throw new Error(formatParserError(firstError))
  }

  const jsxRoots = collectRootJsxNodes(parsed.program)
  if (!jsxRoots.length) {
    return { code: source, changed: false }
  }

  const builder = new SourceJsxReactBuilder(source, createElementRef, fragmentRef)
  const magic = new MagicString(source)

  jsxRoots.sort(compareByRangeStartDesc).forEach(node => {
    magic.overwrite(node.range[0], node.range[1], builder.compile(node))
  })

  return {
    code: magic.toString(),
    changed: true,
  }
}
