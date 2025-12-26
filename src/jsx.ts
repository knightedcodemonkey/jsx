import { parseSync } from 'oxc-parser'
import type {
  Expression,
  JSXAttribute,
  JSXChild,
  JSXElement,
  JSXFragment,
  JSXSpreadAttribute,
} from '@oxc-project/types'
import {
  buildTemplate,
  evaluateExpression,
  extractRootNode,
  formatTaggedTemplateParserError,
  getIdentifierName,
  normalizeJsxTextSegments,
  parserOptions,
  type TemplateContext,
} from './runtime/shared.js'
import {
  find as findPropertyInfo,
  html as htmlProperties,
  svg as svgProperties,
  type Info as PropertyInfo,
  type Space as PropertySpace,
} from 'property-information'
import {
  createResolveAttributes,
  type Namespace,
} from './internal/attribute-resolution.js'
import {
  parseEventPropName,
  resolveEventHandlerValue,
} from './internal/event-bindings.js'

type JsxContext = TemplateContext<JsxComponent>
type ElementWithIndex = Element & Record<string, unknown>

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

const ensureDomAvailable = () => {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new Error(
      'The jsx template tag requires a DOM-like environment (document missing).',
    )
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

const ATTRIBUTE_NAMESPACE_URIS: Record<Exclude<PropertySpace, 'html' | 'svg'>, string> = {
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xmlns: 'http://www.w3.org/2000/xmlns/',
}

const getAttributeNamespace = (space: PropertySpace | undefined) => {
  if (!space || space === 'html' || space === 'svg') {
    return undefined
  }

  return ATTRIBUTE_NAMESPACE_URIS[space]
}

const getSchemaForNamespace = (namespace: Namespace) =>
  namespace === 'svg' ? svgProperties : htmlProperties

const setAttributeValue = (element: Element, info: PropertyInfo, value: unknown) => {
  const namespaceUri = getAttributeNamespace(info.space)
  const attrValue = String(value)

  if (namespaceUri) {
    element.setAttributeNS(namespaceUri, info.attribute, attrValue)
    return
  }

  element.setAttribute(info.attribute, attrValue)
}

const removeAttributeValue = (element: Element, info: PropertyInfo) => {
  const namespaceUri = getAttributeNamespace(info.space)

  if (namespaceUri) {
    element.removeAttributeNS(namespaceUri, info.attribute)
    return
  }

  element.removeAttribute(info.attribute)
}

const joinTokenList = (value: unknown, delimiter: string) => {
  if (!Array.isArray(value)) {
    return value
  }

  return value.filter(Boolean).join(delimiter)
}

const shouldAssignProperty = (
  element: Element,
  namespace: Namespace,
  info: PropertyInfo,
) => {
  if (namespace === 'svg') {
    return false
  }

  if (!info.property || info.property.includes(':')) {
    return false
  }

  return info.property in (element as ElementWithIndex)
}

const setDomProp = (
  element: Element,
  name: string,
  value: unknown,
  namespace: Namespace,
) => {
  if (value === null || value === undefined) {
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

  const eventBinding = parseEventPropName(name)
  if (eventBinding) {
    const handlerValue = resolveEventHandlerValue(name, value)

    if (handlerValue) {
      let options = handlerValue.options ? { ...handlerValue.options } : undefined

      if (eventBinding.capture) {
        if (!options) {
          options = { capture: true }
        } else {
          options.capture = true
        }
      }

      element.addEventListener(eventBinding.eventName, handlerValue.listener, options)
      return
    }
  }

  const info = findPropertyInfo(getSchemaForNamespace(namespace), name)
  const elementWithIndex = element as ElementWithIndex
  const canAssignProperty = shouldAssignProperty(element, namespace, info)

  if (info.mustUseProperty) {
    const nextValue = info.boolean ? Boolean(value) : value
    elementWithIndex[info.property] = nextValue as never
    return
  }

  if (info.boolean) {
    const boolValue = Boolean(value)

    if (canAssignProperty) {
      elementWithIndex[info.property] = boolValue as never
    }

    if (boolValue) {
      setAttributeValue(element, info, '')
    } else {
      removeAttributeValue(element, info)
    }
    return
  }

  let normalizedValue: unknown = value

  if (info.spaceSeparated) {
    normalizedValue = joinTokenList(value, ' ')
  } else if (info.commaSeparated) {
    normalizedValue = joinTokenList(value, ',')
  } else if (info.commaOrSpaceSeparated) {
    normalizedValue = joinTokenList(value, ' ')
  }

  if (info.booleanish && typeof normalizedValue === 'boolean') {
    normalizedValue = normalizedValue ? 'true' : 'false'
  }

  if (info.overloadedBoolean) {
    if (normalizedValue === false) {
      removeAttributeValue(element, info)
      return
    }

    if (normalizedValue === true) {
      setAttributeValue(element, info, '')
      return
    }
  }

  if (canAssignProperty) {
    elementWithIndex[info.property] = normalizedValue as never
    return
  }

  if (normalizedValue === false) {
    return
  }

  setAttributeValue(element, info, normalizedValue)
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

const evaluateExpressionWithNamespace = (
  expression: Expression | JSXElement | JSXFragment,
  ctx: JsxContext,
  namespace: Namespace,
) => evaluateExpression(expression, ctx, node => evaluateJsxNode(node, ctx, namespace))

const resolveAttributes = createResolveAttributes<JsxComponent>({
  getIdentifierName,
  evaluateExpressionWithNamespace,
})

const applyDomAttributes = (
  element: Element,
  attributes: (JSXAttribute | JSXSpreadAttribute)[],
  ctx: JsxContext,
  namespace: Namespace,
) => {
  const props = resolveAttributes(attributes, ctx, namespace)

  Object.entries(props).forEach(([name, value]) => {
    if (name === 'key') {
      return
    }

    if (name === 'children') {
      appendChildValue(element, value as JsxRenderable)
      return
    }

    setDomProp(element, name, value, namespace)
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
        const segments = normalizeJsxTextSegments(child.value, ctx.placeholders)
        segments.forEach(segment => {
          resolved.push(segment as JsxRenderable)
        })
        break
      }
      case 'JSXExpressionContainer': {
        if (child.expression.type === 'JSXEmptyExpression') {
          break
        }
        resolved.push(
          evaluateExpressionWithNamespace(
            child.expression,
            ctx,
            namespace,
          ) as JsxRenderable,
        )
        break
      }
      case 'JSXSpreadChild': {
        const spreadValue = evaluateExpressionWithNamespace(
          child.expression,
          ctx,
          namespace,
        )
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
  const props = resolveAttributes(element.openingElement.attributes, ctx, namespace)
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

  applyDomAttributes(domElement, opening.attributes, ctx, nextNamespace)

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

export const jsx = (
  templates: TemplateStringsArray,
  ...values: unknown[]
): JsxRenderable => {
  ensureDomAvailable()
  const build = buildTemplate<JsxComponent>(templates, values)
  const result = parseSync('inline.jsx', build.source, parserOptions)

  if (result.errors.length > 0) {
    throw new Error(
      formatTaggedTemplateParserError(
        'jsx',
        templates,
        build.diagnostics,
        result.errors[0]!,
      ),
    )
  }

  const root = extractRootNode(result.program)
  const ctx: JsxContext = {
    source: build.source,
    placeholders: build.placeholders,
    components: new Map(build.bindings.map(binding => [binding.name, binding.value])),
  }

  return evaluateJsxNode(root, ctx, null)
}
