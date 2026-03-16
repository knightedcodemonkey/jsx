import type { Namespace } from './attribute-resolution.js'
import type { JsxComponent, JsxRenderable } from './jsx-types.js'

export const Fragment = Symbol.for('@knighted/jsx::Fragment')

type JsxPropsRecord = Record<string, unknown>

export type JsxCreateElement = {
  (type: typeof Fragment, props: null, ...children: JsxRenderable[]): DocumentFragment
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

export const createDomCreateElement = ({
  ensureDomAvailable,
  appendChildValue,
  setDomProp,
  isPromiseLike,
}: DomCreateElementHelpers): JsxCreateElement => {
  function createElement(
    type: typeof Fragment,
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
    type: string | JsxComponent | typeof Fragment,
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

    const nextNamespace: Namespace = type === 'svg' ? 'svg' : null
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
