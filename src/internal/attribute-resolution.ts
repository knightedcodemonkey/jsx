import type {
  Expression,
  JSXAttribute,
  JSXElement,
  JSXFragment,
  JSXSpreadAttribute,
} from '@oxc-project/types'
import type { TemplateComponent, TemplateContext } from '../runtime/shared.js'
import {
  createDevError,
  describeValue,
  emitDevWarning,
  isDevEnvironment,
} from './dev-environment.js'

export type Namespace = 'svg' | null

export type EvaluateExpressionWithNamespace<TComponent extends TemplateComponent> = (
  expression: Expression | JSXElement | JSXFragment,
  ctx: TemplateContext<TComponent>,
  namespace: Namespace,
) => unknown

export type ResolveAttributesDependencies<TComponent extends TemplateComponent> = {
  getIdentifierName: (name: JSXAttribute['name']) => string
  evaluateExpressionWithNamespace: EvaluateExpressionWithNamespace<TComponent>
}

export type ResolveAttributesFn<TComponent extends TemplateComponent> = (
  attributes: (JSXAttribute | JSXSpreadAttribute)[],
  ctx: TemplateContext<TComponent>,
  namespace: Namespace,
) => Record<string, unknown>

const isAsciiLowercase = (char: string) => char >= 'a' && char <= 'z'

const warnLowercaseEventProp = (name: string) => {
  if (!name.startsWith('on') || name.startsWith('on:') || name.length < 3) {
    return
  }

  const indicator = name[2] ?? ''
  if (!isAsciiLowercase(indicator)) {
    return
  }

  const suggestion = `${name.slice(0, 2)}${indicator.toUpperCase()}${name.slice(3)}`
  emitDevWarning(
    `Use camelCase DOM event props when targeting runtime jsx templates. Received "${name}"; did you mean "${suggestion}"?`,
  )
}

const ensureValidDangerouslySetInnerHTML = (value: unknown) => {
  if (!isDevEnvironment()) {
    return
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createDevError(
      'dangerouslySetInnerHTML expects an object with a string __html field.',
    )
  }

  const html = (value as { __html?: unknown }).__html
  if (typeof html !== 'string') {
    throw createDevError(
      `dangerouslySetInnerHTML.__html must be a string but received ${describeValue(html)}.`,
    )
  }
}

export const createResolveAttributes = <TComponent extends TemplateComponent>(
  deps: ResolveAttributesDependencies<TComponent>,
): ResolveAttributesFn<TComponent> => {
  const { getIdentifierName, evaluateExpressionWithNamespace } = deps

  return (attributes, ctx, namespace) => {
    const props: Record<string, unknown> = {}
    const assignProp = (propName: string, propValue: unknown) => {
      if (propName === 'dangerouslySetInnerHTML') {
        ensureValidDangerouslySetInnerHTML(propValue)
      }
      props[propName] = propValue
    }

    attributes.forEach(attribute => {
      if (attribute.type === 'JSXSpreadAttribute') {
        const spreadValue = evaluateExpressionWithNamespace(
          attribute.argument,
          ctx,
          namespace,
        )

        if (
          spreadValue &&
          typeof spreadValue === 'object' &&
          !Array.isArray(spreadValue)
        ) {
          Object.assign(props, spreadValue)
        }

        return
      }

      const name = getIdentifierName(attribute.name)
      warnLowercaseEventProp(name)

      if (!attribute.value) {
        assignProp(name, true)
        return
      }

      if (attribute.value.type === 'Literal') {
        assignProp(name, attribute.value.value)
        return
      }

      if (attribute.value.type === 'JSXExpressionContainer') {
        if (attribute.value.expression.type === 'JSXEmptyExpression') {
          return
        }

        assignProp(
          name,
          evaluateExpressionWithNamespace(attribute.value.expression, ctx, namespace),
        )
      }
    })

    return props
  }
}
