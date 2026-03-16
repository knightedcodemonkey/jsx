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
