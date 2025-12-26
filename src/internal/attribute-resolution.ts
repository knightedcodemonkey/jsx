import type {
  Expression,
  JSXAttribute,
  JSXElement,
  JSXFragment,
  JSXSpreadAttribute,
} from '@oxc-project/types'
import type { TemplateComponent, TemplateContext } from '../runtime/shared.js'
export type AttributeDiagnosticsHooks = {
  warnLowercaseEventProp?: (name: string) => void
  ensureValidDangerouslySetInnerHTML?: (value: unknown) => void
}

let attributeDiagnostics: AttributeDiagnosticsHooks | null = null

export const setAttributeDiagnosticsHooks = (hooks: AttributeDiagnosticsHooks | null) => {
  attributeDiagnostics = hooks
}

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

const warnLowercaseEventProp = (name: string) => {
  attributeDiagnostics?.warnLowercaseEventProp?.(name)
}

const ensureValidDangerouslySetInnerHTML = (value: unknown) => {
  attributeDiagnostics?.ensureValidDangerouslySetInnerHTML?.(value)
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
