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

export type JsxChildren = JsxRenderable | JsxRenderable[]

export type JsxComponent<Props = Record<string, unknown>> = {
  (props: Props & { children?: JsxChildren }): JsxRenderable
  displayName?: string
}
