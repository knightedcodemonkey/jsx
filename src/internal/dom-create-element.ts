import type { Namespace } from './attribute-resolution.js'
import type { JsxComponent, JsxRenderable } from './jsx-types.js'

export declare const FragmentToken: unique symbol
export type JsxFragmentToken = typeof FragmentToken

export const Fragment = Symbol.for('@knighted/jsx::Fragment') as JsxFragmentToken

type JsxPropsRecord = Record<string, unknown>
const CREATE_ELEMENT_NAMESPACE_PROP = '__jsxNs'

export type JsxCreateElement = {
  (type: JsxFragmentToken, props: null, ...children: JsxRenderable[]): DocumentFragment
  <Props extends JsxPropsRecord>(
    type: JsxComponent<Props>,
    props: (Props & { children?: JsxRenderable | JsxRenderable[] }) | null,
    ...children: JsxRenderable[]
  ): JsxRenderable
  (
    type: string,
    props: JsxPropsRecord | null,
    ...children: JsxRenderable[]
  ): JsxRenderable
}

type DomCreateElementHelpers = {
  ensureDomAvailable: () => void
  appendChildValue: (parent: Node & ParentNode, value: JsxRenderable) => void
  setDomProp: (
    element: Element,
    name: string,
    value: unknown,
    namespace: Namespace,
  ) => void
  isPromiseLike: (value: unknown) => value is PromiseLike<unknown>
}

const resolveChildrenForCreateElement = (
  props: JsxPropsRecord,
  children: JsxRenderable[],
) => {
  if (children.length > 0) {
    return children
  }

  if (!Object.prototype.hasOwnProperty.call(props, 'children')) {
    return []
  }

  return [props.children as JsxRenderable]
}

const createPropsForComponent = (props: JsxPropsRecord, children: JsxRenderable[]) => {
  const nextProps = { ...props }

  if (children.length === 1) {
    nextProps.children = children[0]
  } else if (children.length > 1) {
    nextProps.children = children
  } else {
    delete nextProps.children
  }

  return nextProps
}

const resolveNamespaceOverride = (props: JsxPropsRecord): Namespace | undefined => {
  if (!Object.prototype.hasOwnProperty.call(props, CREATE_ELEMENT_NAMESPACE_PROP)) {
    return undefined
  }

  const override = props[CREATE_ELEMENT_NAMESPACE_PROP]
  delete props[CREATE_ELEMENT_NAMESPACE_PROP]

  if (override === 'svg' || override === null) {
    return override
  }

  throw new Error(`${CREATE_ELEMENT_NAMESPACE_PROP} must be "svg" or null when provided.`)
}

export const createDomCreateElement = ({
  ensureDomAvailable,
  appendChildValue,
  setDomProp,
  isPromiseLike,
}: DomCreateElementHelpers): JsxCreateElement => {
  function createElement(
    type: JsxFragmentToken,
    props: null,
    ...children: JsxRenderable[]
  ): DocumentFragment
  function createElement<Props extends JsxPropsRecord>(
    type: JsxComponent<Props>,
    props: (Props & { children?: JsxRenderable | JsxRenderable[] }) | null,
    ...children: JsxRenderable[]
  ): JsxRenderable
  function createElement(
    type: string,
    props: JsxPropsRecord | null,
    ...children: JsxRenderable[]
  ): JsxRenderable
  function createElement(
    type: string | JsxComponent | JsxFragmentToken,
    props: JsxPropsRecord | null,
    ...children: JsxRenderable[]
  ): JsxRenderable {
    ensureDomAvailable()

    const nextProps = props ? { ...props } : {}
    const resolvedChildren = resolveChildrenForCreateElement(nextProps, children)

    if (type === Fragment) {
      const fragment = document.createDocumentFragment()
      resolvedChildren.forEach(child => appendChildValue(fragment, child))
      return fragment
    }

    if (typeof type === 'function') {
      const result = type(createPropsForComponent(nextProps, resolvedChildren))

      if (isPromiseLike(result)) {
        throw new Error('Async jsx components are not supported.')
      }

      return result
    }

    if (typeof type !== 'string') {
      throw new Error(`Unsupported jsx createElement type: ${String(type)}`)
    }

    delete nextProps.children
    const namespaceOverride = resolveNamespaceOverride(nextProps)

    const nextNamespace: Namespace = namespaceOverride ?? (type === 'svg' ? 'svg' : null)
    const domElement =
      nextNamespace === 'svg'
        ? document.createElementNS('http://www.w3.org/2000/svg', type)
        : document.createElement(type)

    Object.entries(nextProps).forEach(([name, value]) => {
      if (name === 'key') {
        return
      }

      setDomProp(domElement, name, value, nextNamespace)
    })

    resolvedChildren.forEach(value => appendChildValue(domElement, value))

    return domElement
  }

  return createElement
}
