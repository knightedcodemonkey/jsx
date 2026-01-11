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
} from '../runtime/shared.js'
import {
  Fragment,
  createElement,
  type ComponentType,
  type DOMAttributes,
  type EventHandler,
  type JSX as ReactJSX,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from 'react'

export type ReactJsxComponent<Props = Record<string, unknown>> = ComponentType<
  PropsWithChildren<Props>
>

export type ReactJsxRenderable = ReactNode
export type ReactJsxRef<T> = Ref<T>
export type ReactJsxEventHandler<E extends SyntheticEvent> = EventHandler<E>
export type ReactJsxDomAttributes<T = unknown> = DOMAttributes<T>
export type ReactJsxIntrinsicElements = ReactJSX.IntrinsicElements
export type ReactJsxIntrinsicElement<Tag extends keyof ReactJsxIntrinsicElements> =
  ReactJsxIntrinsicElements[Tag]

type ReactJsxContext = TemplateContext<ReactJsxComponent>

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

const appendReactChild = (bucket: ReactNode[], value: unknown) => {
  if (value === null || value === undefined) {
    return
  }

  if (typeof value === 'boolean') {
    return
  }

  if (isPromiseLike(value)) {
    throw new Error('Async values are not supported inside reactJsx template results.')
  }

  if (Array.isArray(value)) {
    value.forEach(entry => appendReactChild(bucket, entry))
    return
  }

  if (isIterable(value)) {
    for (const entry of value as Iterable<unknown>) {
      appendReactChild(bucket, entry)
    }
    return
  }

  bucket.push(value as ReactNode)
}

const evaluateExpressionForReact = (
  expression: Expression | JSXElement | JSXFragment,
  ctx: ReactJsxContext,
) => evaluateExpression(expression, ctx, node => evaluateReactJsxNode(node, ctx))

const resolveAttributes = (
  attributes: (JSXAttribute | JSXSpreadAttribute)[],
  ctx: ReactJsxContext,
) => {
  const props: Record<string, unknown> = {}

  attributes.forEach(attribute => {
    if (attribute.type === 'JSXSpreadAttribute') {
      const spreadValue = evaluateExpressionForReact(attribute.argument, ctx)

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

      props[name] = evaluateExpressionForReact(attribute.value.expression, ctx)
    }
  })

  return props
}

const evaluateReactJsxChildren = (children: JSXChild[], ctx: ReactJsxContext) => {
  const resolved: ReactNode[] = []

  children.forEach(child => {
    switch (child.type) {
      case 'JSXText': {
        const segments = normalizeJsxTextSegments(child.value, ctx.placeholders)
        segments.forEach(segment => appendReactChild(resolved, segment))
        break
      }
      case 'JSXExpressionContainer': {
        if (child.expression.type === 'JSXEmptyExpression') {
          break
        }
        appendReactChild(resolved, evaluateExpressionForReact(child.expression, ctx))
        break
      }
      case 'JSXSpreadChild': {
        const spreadValue = evaluateExpressionForReact(child.expression, ctx)
        if (spreadValue !== undefined && spreadValue !== null) {
          appendReactChild(resolved, spreadValue)
        }
        break
      }
      case 'JSXElement':
      case 'JSXFragment': {
        resolved.push(evaluateReactJsxNode(child, ctx))
        break
      }
    }
  })

  return resolved
}

const createReactElement = (
  type: string | ReactJsxComponent,
  props: Record<string, unknown>,
  children: ReactNode[],
) => {
  return createElement(type as never, props, ...children)
}

const evaluateReactJsxElement = (
  element: JSXElement,
  ctx: ReactJsxContext,
): ReactElement => {
  const opening = element.openingElement
  const tagName = getIdentifierName(opening.name)
  const component = ctx.components.get(tagName)
  const props = resolveAttributes(opening.attributes, ctx)
  const childValues = evaluateReactJsxChildren(element.children, ctx)

  if (component) {
    return createReactElement(component, props, childValues)
  }

  if (/[A-Z]/.test(tagName[0] ?? '')) {
    throw new Error(
      `Unknown component "${tagName}". Did you interpolate it with the template literal?`,
    )
  }

  return createReactElement(tagName, props, childValues)
}

const evaluateReactJsxNode = (
  node: JSXElement | JSXFragment,
  ctx: ReactJsxContext,
): ReactElement => {
  if (node.type === 'JSXFragment') {
    const children = evaluateReactJsxChildren(node.children, ctx)
    return createElement(Fragment, null, ...children)
  }

  return evaluateReactJsxElement(node, ctx)
}

export const reactJsx = (
  templates: TemplateStringsArray,
  ...values: unknown[]
): ReactElement => {
  const build = buildTemplate<ReactJsxComponent>(templates, values)
  const result = parseSync('inline.jsx', build.source, parserOptions)

  if (result.errors.length > 0) {
    throw new Error(
      formatTaggedTemplateParserError(
        'reactJsx',
        templates,
        build.diagnostics,
        result.errors[0]!,
      ),
    )
  }

  const root = extractRootNode(result.program)
  const ctx: ReactJsxContext = {
    source: build.source,
    placeholders: build.placeholders,
    components: new Map(build.bindings.map(binding => [binding.name, binding.value])),
  }

  return evaluateReactJsxNode(root, ctx)
}
