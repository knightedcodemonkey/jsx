import type {
  Expression,
  JSXElement,
  JSXFragment,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  Program,
} from '@oxc-project/types'
import type { OxcError, ParserOptions } from 'oxc-parser'
import type {
  TemplateDiagnostics,
  TemplateExpressionRange,
} from '../internal/template-diagnostics.js'
import { normalizeJsxText } from '../shared/normalize-text.js'

export { formatTaggedTemplateParserError } from '../internal/template-diagnostics.js'
export type {
  TemplateDiagnostics,
  TemplateExpressionRange,
} from '../internal/template-diagnostics.js'

const OPEN_TAG_RE = /<\s*$/
const CLOSE_TAG_RE = /<\/\s*$/
export const PLACEHOLDER_PREFIX = '__KX_EXPR__'
export const placeholderPattern = new RegExp(`${PLACEHOLDER_PREFIX}\\d+_\\d+__`, 'g')

let invocationCounter = 0

export const formatParserError = (error: OxcError) => {
  let message = `[oxc-parser] ${error.message}`
  const primaryLabel = error.labels?.[0]

  if (primaryLabel?.message) {
    message += `\n${primaryLabel.message}`
  }

  if (error.codeframe) {
    message += `\n${error.codeframe}`
  }

  if (error.helpMessage) {
    message += `\n${error.helpMessage}`
  }

  return message
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTemplateFunction = (...args: any[]) => unknown
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTemplateConstructor = abstract new (...args: any[]) => unknown

export type TemplateComponent = (AnyTemplateFunction | AnyTemplateConstructor) & {
  displayName?: string
  name?: string
}

export type BindingEntry<TComponent extends TemplateComponent> = {
  name: string
  value: TComponent
}

export type TemplateBuildResult<TComponent extends TemplateComponent> = {
  source: string
  placeholders: Map<string, unknown>
  bindings: BindingEntry<TComponent>[]
  diagnostics: TemplateDiagnostics
}

export type TemplateContext<TComponent extends TemplateComponent> = {
  source: string
  placeholders: Map<string, unknown>
  components: Map<string, TComponent>
}

export const parserOptions: ParserOptions = {
  lang: 'jsx',
  sourceType: 'module',
  range: true,
  preserveParens: true,
}

export const extractRootNode = (program: Program): JSXElement | JSXFragment => {
  for (const statement of program.body) {
    if (statement.type === 'ExpressionStatement') {
      const expression = statement.expression

      if (expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
        return expression
      }
    }
  }

  throw new Error('The jsx template must contain a single JSX element or fragment.')
}

export const getIdentifierName = (
  identifier: JSXIdentifier | JSXNamespacedName | JSXMemberExpression,
): string => {
  switch (identifier.type) {
    case 'JSXIdentifier':
      return identifier.name
    case 'JSXNamespacedName':
      return `${identifier.namespace.name}:${identifier.name.name}`
    case 'JSXMemberExpression':
      return `${getIdentifierName(identifier.object)}.${identifier.property.name}`
    default:
      return ''
  }
}

type AnyOxcNode = {
  type: string
  [key: string]: unknown
}

export const walkAst = (node: unknown, visitor: (target: AnyOxcNode) => void) => {
  if (!node || typeof node !== 'object') {
    return
  }

  const candidate = node as Partial<AnyOxcNode>
  if (typeof candidate.type !== 'string') {
    return
  }

  visitor(candidate as AnyOxcNode)

  Object.values(candidate).forEach(value => {
    if (!value) {
      return
    }

    if (Array.isArray(value)) {
      value.forEach(child => walkAst(child, visitor))
      return
    }

    if (typeof value === 'object') {
      walkAst(value, visitor)
    }
  })
}

export const normalizeJsxTextSegments = (
  value: string,
  placeholders: Map<string, unknown>,
) => {
  const normalized = normalizeJsxText(value)
  if (!normalized) {
    return [] as Array<string | unknown>
  }

  const segments: Array<string | unknown> = []
  placeholderPattern.lastIndex = 0
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = placeholderPattern.exec(normalized))) {
    const index = match.index
    const slice = normalized.slice(cursor, index)
    if (slice) {
      segments.push(slice)
    }

    const token = match[0]
    if (placeholders.has(token)) {
      segments.push(placeholders.get(token)!)
    } else {
      segments.push(token)
    }

    cursor = index + token.length
  }

  const remainder = normalized.slice(cursor)
  if (remainder) {
    segments.push(remainder)
  }

  return segments
}

export const collectPlaceholderNames = <TComponent extends TemplateComponent>(
  expression: Expression | JSXElement | JSXFragment,
  ctx: TemplateContext<TComponent>,
) => {
  const placeholders = new Set<string>()

  walkAst(expression, node => {
    if (node.type === 'Identifier' && ctx.placeholders.has(node.name as string)) {
      placeholders.add(node.name as string)
    }
  })

  return Array.from(placeholders)
}

export const evaluateExpression = <TComponent extends TemplateComponent>(
  expression: Expression | JSXElement | JSXFragment,
  ctx: TemplateContext<TComponent>,
  evaluateJsxNode: (node: JSXElement | JSXFragment) => unknown,
) => {
  if (expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
    return evaluateJsxNode(expression)
  }

  if (!('range' in expression) || !expression.range) {
    throw new Error('Unable to evaluate expression: missing source range information.')
  }

  const [start, end] = expression.range
  const source = ctx.source.slice(start, end)
  const placeholders = collectPlaceholderNames(expression, ctx)

  try {
    const evaluator = new Function(
      ...placeholders,
      `"use strict"; return (${source});`,
    ) as (...args: unknown[]) => unknown
    const args = placeholders.map(name => ctx.placeholders.get(name))
    return evaluator(...args)
  } catch (error) {
    throw new Error(
      `Failed to evaluate expression ${source}: ${(error as Error).message}`,
    )
  }
}

export const sanitizeIdentifier = (value: string) => {
  const cleaned = value.replace(/[^a-zA-Z0-9_$]/g, '')
  if (!cleaned) {
    return 'Component'
  }

  if (!/[A-Za-z_$]/.test(cleaned[0]!)) {
    return `Component${cleaned}`
  }

  return cleaned
}

export const ensureBinding = <TComponent extends TemplateComponent>(
  value: TComponent,
  bindings: BindingEntry<TComponent>[],
  bindingLookup: Map<TComponent, BindingEntry<TComponent>>,
) => {
  const existing = bindingLookup.get(value)
  if (existing) {
    return existing
  }

  const descriptor = value.displayName || value.name || `Component${bindings.length}`
  const baseName = sanitizeIdentifier(descriptor ?? '')
  let candidate = baseName
  let suffix = 1

  while (bindings.some(binding => binding.name === candidate)) {
    candidate = `${baseName}${suffix++}`
  }

  const binding: BindingEntry<TComponent> = { name: candidate, value }
  bindings.push(binding)
  bindingLookup.set(value, binding)
  return binding
}

export const buildTemplate = <TComponent extends TemplateComponent>(
  strings: TemplateStringsArray,
  values: unknown[],
): TemplateBuildResult<TComponent> => {
  const raw = strings.raw ?? strings
  const placeholders = new Map<string, unknown>()
  const bindings: BindingEntry<TComponent>[] = []
  const bindingLookup = new Map<TComponent, BindingEntry<TComponent>>()
  let source = raw[0] ?? ''
  const templateId = invocationCounter++
  let placeholderIndex = 0
  const expressionRanges: TemplateExpressionRange[] = []

  for (let idx = 0; idx < values.length; idx++) {
    const chunk = raw[idx] ?? ''
    const nextChunk = raw[idx + 1] ?? ''
    const value = values[idx]

    const isTagNamePosition = OPEN_TAG_RE.test(chunk) || CLOSE_TAG_RE.test(chunk)
    let insertion: string

    if (isTagNamePosition && typeof value === 'function') {
      const binding = ensureBinding(value as TComponent, bindings, bindingLookup)
      insertion = binding.name
    } else if (isTagNamePosition && typeof value === 'string') {
      insertion = value
    } else {
      const placeholder = `${PLACEHOLDER_PREFIX}${templateId}_${placeholderIndex++}__`
      placeholders.set(placeholder, value)
      insertion = placeholder
    }

    const sourceStart = source.length
    source += insertion
    const sourceEnd = source.length

    expressionRanges.push({
      index: idx,
      sourceStart,
      sourceEnd,
    })

    source += nextChunk
  }

  return {
    source,
    placeholders,
    bindings,
    diagnostics: { expressionRanges },
  }
}
