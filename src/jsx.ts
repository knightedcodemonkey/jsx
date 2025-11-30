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

type BindingEntry = {
  name: string
  value: JsxComponent
}

type TemplateBuildResult = {
  source: string
  placeholders: Map<string, unknown>
  bindings: BindingEntry[]
}

type Namespace = 'svg' | null

type JsxContext = {
  source: string
  placeholders: Map<string, unknown>
  components: Map<string, JsxComponent>
}

const OPEN_TAG_RE = /<\s*$/
const CLOSE_TAG_RE = /<\/\s*$/
const PLACEHOLDER_PREFIX = '__KX_EXPR__'

let invocationCounter = 0

export type JsxRenderable =
  | Node
  | DocumentFragment
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Iterable<JsxRenderable>

export type JsxComponent<Props = Record<string, unknown>> = {
  (props: Props & { children?: JsxRenderable | JsxRenderable[] }): JsxRenderable
  displayName?: string
}

const parserOptions: ParserOptions = {
  lang: 'jsx',
  sourceType: 'module',
  range: true,
  preserveParens: true,
}

const ensureDomAvailable = () => {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new Error(
      'The jsx template tag requires a DOM-like environment (document missing).',
    )
  }
}

const formatParserError = (error: OxcError) => {
  let message = `[oxc-parser] ${error.message}`

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

const extractRootNode = (program: Program): JSXElement | JSXFragment => {
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

const getIdentifierName = (
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

const isNodeLike = (value: unknown): value is Node | DocumentFragment => {
  if (typeof Node === 'undefined') {
    return false
  }

  return value instanceof Node || value instanceof DocumentFragment
}

const isIterable = (value: unknown): value is Iterable<unknown> => {
  if (!value || typeof value === 'string') {
    return false
  }

  return typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function'
}

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return false
  }

  return typeof (value as { then?: unknown }).then === 'function'
}

const normalizeJsxText = (value: string) => {
  const collapsed = value.replace(/\r/g, '').replace(/\n\s+/g, ' ')
  const trimmed = collapsed.trim()

  return trimmed.length > 0 ? trimmed : ''
}

const setDomProp = (element: Element, name: string, value: unknown) => {
  if (value === false || value === null || value === undefined) {
    return
  }

  if (
    name === 'dangerouslySetInnerHTML' &&
    typeof value === 'object' &&
    value &&
    '__html' in value
  ) {
    element.innerHTML = String((value as { __html: unknown }).__html ?? '')
    return
  }

  if (name === 'ref') {
    if (typeof value === 'function') {
      value(element)
      return
    }

    if (value && typeof value === 'object') {
      ;(value as { current?: Element }).current = element
      return
    }
  }

  if (name === 'style' && typeof value === 'object' && value !== null) {
    const styleRecord = value as Record<string, unknown>
    const styleTarget = (element as Element & { style?: CSSStyleDeclaration }).style

    if (!styleTarget) {
      return
    }

    type MutableStyle = CSSStyleDeclaration & Record<string, unknown>
    const mutableStyle = styleTarget as MutableStyle

    Object.entries(styleRecord).forEach(([prop, propValue]) => {
      if (propValue === null || propValue === undefined) {
        return
      }
      if (prop.startsWith('--')) {
        styleTarget.setProperty(prop, String(propValue))
        return
      }
      mutableStyle[prop] = propValue as never
    })
    return
  }

  if (typeof value === 'function' && name.startsWith('on')) {
    const eventName = name.slice(2).toLowerCase()
    element.addEventListener(eventName, value as EventListener)
    return
  }

  if (name === 'class' || name === 'className') {
    const classValue = Array.isArray(value)
      ? value.filter(Boolean).join(' ')
      : String(value)
    element.setAttribute('class', classValue)
    return
  }

  if (name === 'htmlFor') {
    element.setAttribute('for', String(value))
    return
  }

  if (name in element && !name.includes('-')) {
    type ElementWithIndex = Element & Record<string, unknown>
    ;(element as ElementWithIndex)[name] = value as never
    return
  }

  element.setAttribute(name, value === true ? '' : String(value))
}

const appendChildValue = (parent: Node & ParentNode, value: JsxRenderable) => {
  if (value === null || value === undefined) {
    return
  }

  if (typeof value === 'boolean') {
    return
  }

  if (isPromiseLike(value)) {
    throw new Error('Async values are not supported inside jsx template results.')
  }

  if (Array.isArray(value)) {
    value.forEach(child => appendChildValue(parent, child))
    return
  }

  if (isIterable(value)) {
    for (const entry of value as Iterable<JsxRenderable>) {
      appendChildValue(parent, entry)
    }
    return
  }

  if (isNodeLike(value)) {
    parent.appendChild(value)
    return
  }

  parent.appendChild(document.createTextNode(String(value)))
}

const resolveAttributes = (
  attributes: (JSXAttribute | JSXSpreadAttribute)[],
  ctx: JsxContext,
) => {
  const props: Record<string, unknown> = {}

  attributes.forEach(attribute => {
    if (attribute.type === 'JSXSpreadAttribute') {
      const spreadValue = evaluateExpression(attribute.argument, ctx)

      if (spreadValue && typeof spreadValue === 'object' && !Array.isArray(spreadValue)) {
        Object.assign(props, spreadValue)
      }

      return
    }

    const name = getIdentifierName(attribute.name)

    if (!attribute.value) {
      props[name] = true
      return
    }

    if (attribute.value.type === 'Literal') {
      props[name] = attribute.value.value
      return
    }

    if (attribute.value.type === 'JSXExpressionContainer') {
      if (attribute.value.expression.type === 'JSXEmptyExpression') {
        return
      }

      props[name] = evaluateExpression(attribute.value.expression, ctx)
    }
  })

  return props
}

const applyDomAttributes = (
  element: Element,
  attributes: (JSXAttribute | JSXSpreadAttribute)[],
  ctx: JsxContext,
) => {
  const props = resolveAttributes(attributes, ctx)

  Object.entries(props).forEach(([name, value]) => {
    if (name === 'key') {
      return
    }

    if (name === 'children') {
      appendChildValue(element, value as JsxRenderable)
      return
    }

    setDomProp(element, name, value)
  })
}

const evaluateJsxChildren = (
  children: JSXChild[],
  ctx: JsxContext,
  namespace: Namespace,
): JsxRenderable[] => {
  const resolved: JsxRenderable[] = []

  children.forEach(child => {
    switch (child.type) {
      case 'JSXText': {
        const text = normalizeJsxText(child.value)
        if (text) {
          resolved.push(text)
        }
        break
      }
      case 'JSXExpressionContainer': {
        if (child.expression.type === 'JSXEmptyExpression') {
          break
        }
        resolved.push(evaluateExpression(child.expression, ctx) as JsxRenderable)
        break
      }
      case 'JSXSpreadChild': {
        const spreadValue = evaluateExpression(child.expression, ctx)
        if (spreadValue !== undefined && spreadValue !== null) {
          resolved.push(spreadValue as JsxRenderable)
        }
        break
      }
      case 'JSXElement':
      case 'JSXFragment': {
        resolved.push(evaluateJsxNode(child, ctx, namespace))
        break
      }
    }
  })

  return resolved
}

const evaluateComponent = (
  element: JSXElement,
  ctx: JsxContext,
  component: JsxComponent,
  namespace: Namespace,
) => {
  const props = resolveAttributes(element.openingElement.attributes, ctx)
  const childValues = evaluateJsxChildren(element.children, ctx, namespace)

  if (childValues.length === 1) {
    props.children = childValues[0]
  } else if (childValues.length > 1) {
    props.children = childValues
  }

  const result = component(props)

  if (isPromiseLike(result)) {
    throw new Error('Async jsx components are not supported.')
  }

  return result
}

const evaluateJsxElement = (
  element: JSXElement,
  ctx: JsxContext,
  namespace: Namespace,
): JsxRenderable => {
  const opening = element.openingElement
  const tagName = getIdentifierName(opening.name)
  const component = ctx.components.get(tagName)

  if (component) {
    return evaluateComponent(element, ctx, component, namespace)
  }

  if (/[A-Z]/.test(tagName[0] ?? '')) {
    throw new Error(
      `Unknown component "${tagName}". Did you interpolate it with the template literal?`,
    )
  }

  const nextNamespace: Namespace = tagName === 'svg' ? 'svg' : namespace
  const childNamespace: Namespace = tagName === 'foreignObject' ? null : nextNamespace
  const domElement =
    nextNamespace === 'svg'
      ? document.createElementNS('http://www.w3.org/2000/svg', tagName)
      : document.createElement(tagName)

  applyDomAttributes(domElement, opening.attributes, ctx)

  const childValues = evaluateJsxChildren(element.children, ctx, childNamespace)
  childValues.forEach(value => appendChildValue(domElement, value))

  return domElement
}

const evaluateJsxNode = (
  node: JSXElement | JSXFragment,
  ctx: JsxContext,
  namespace: Namespace,
): JsxRenderable => {
  if (node.type === 'JSXFragment') {
    const fragment = document.createDocumentFragment()
    const children = evaluateJsxChildren(node.children, ctx, namespace)
    children.forEach(child => appendChildValue(fragment, child))
    return fragment
  }

  return evaluateJsxElement(node, ctx, namespace)
}

type AnyOxcNode = {
  type: string
  [key: string]: unknown
}

const walkAst = (node: unknown, visitor: (target: AnyOxcNode) => void) => {
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

const collectPlaceholderNames = (
  expression: Expression | JSXElement | JSXFragment,
  ctx: JsxContext,
) => {
  const placeholders = new Set<string>()

  walkAst(expression, node => {
    if (node.type === 'Identifier' && ctx.placeholders.has(node.name as string)) {
      placeholders.add(node.name as string)
    }
  })

  return Array.from(placeholders)
}

const evaluateExpression = (
  expression: Expression | JSXElement | JSXFragment,
  ctx: JsxContext,
) => {
  if (expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
    return evaluateJsxNode(expression, ctx, null)
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

const sanitizeIdentifier = (value: string) => {
  const cleaned = value.replace(/[^a-zA-Z0-9_$]/g, '')
  if (!cleaned) {
    return 'Component'
  }

  if (!/[A-Za-z_$]/.test(cleaned[0]!)) {
    return `Component${cleaned}`
  }

  return cleaned
}

const ensureBinding = (
  value: JsxComponent,
  bindings: BindingEntry[],
  bindingLookup: Map<JsxComponent, BindingEntry>,
) => {
  const existing = bindingLookup.get(value)
  if (existing) {
    return existing
  }

  const descriptor = value.displayName || value.name || `Component${bindings.length}`
  const baseName = sanitizeIdentifier(descriptor)
  let candidate = baseName
  let suffix = 1

  while (bindings.some(binding => binding.name === candidate)) {
    candidate = `${baseName}${suffix++}`
  }

  const binding = { name: candidate, value }
  bindings.push(binding)
  bindingLookup.set(value, binding)
  return binding
}

const buildTemplate = (
  strings: TemplateStringsArray,
  values: unknown[],
): TemplateBuildResult => {
  const raw = strings.raw ?? strings
  const placeholders = new Map<string, unknown>()
  const bindings: BindingEntry[] = []
  const bindingLookup = new Map<JsxComponent, BindingEntry>()
  let source = raw[0] ?? ''
  const templateId = invocationCounter++
  let placeholderIndex = 0

  for (let idx = 0; idx < values.length; idx++) {
    const chunk = raw[idx] ?? ''
    const nextChunk = raw[idx + 1] ?? ''
    const value = values[idx]

    const isTagNamePosition = OPEN_TAG_RE.test(chunk) || CLOSE_TAG_RE.test(chunk)

    if (isTagNamePosition && typeof value === 'function') {
      const binding = ensureBinding(value as JsxComponent, bindings, bindingLookup)
      source += binding.name + nextChunk
      continue
    }

    if (isTagNamePosition && typeof value === 'string') {
      source += value + nextChunk
      continue
    }

    const placeholder = `${PLACEHOLDER_PREFIX}${templateId}_${placeholderIndex++}__`
    placeholders.set(placeholder, value)
    source += placeholder + nextChunk
  }

  return { source, placeholders, bindings }
}

export const jsx = (
  templates: TemplateStringsArray,
  ...values: unknown[]
): JsxRenderable => {
  ensureDomAvailable()
  const build = buildTemplate(templates, values)
  const result = parseSync('inline.jsx', build.source, parserOptions)

  if (result.errors.length > 0) {
    throw new Error(formatParserError(result.errors[0]!))
  }

  const root = extractRootNode(result.program)
  const ctx: JsxContext = {
    source: build.source,
    placeholders: build.placeholders,
    components: new Map(build.bindings.map(binding => [binding.name, binding.value])),
  }

  return evaluateJsxNode(root, ctx, null)
}
