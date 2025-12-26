import type {
  Expression,
  JSXAttribute,
  JSXElement,
  JSXFragment,
  JSXSpreadAttribute,
} from '@oxc-project/types'
import type { TemplateComponent, TemplateContext } from '../runtime/shared.js'

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

export const createResolveAttributes = <TComponent extends TemplateComponent>(
  deps: ResolveAttributesDependencies<TComponent>,
): ResolveAttributesFn<TComponent> => {
  const { getIdentifierName, evaluateExpressionWithNamespace } = deps

  return (attributes, ctx, namespace) => {
    const props: Record<string, unknown> = {}

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

        props[name] = evaluateExpressionWithNamespace(
          attribute.value.expression,
          ctx,
          namespace,
        )
      }
    })

    return props
  }
}
