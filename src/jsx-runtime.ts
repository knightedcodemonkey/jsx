import type { JsxRenderable } from './jsx.js'

const runtimeModuleId = '@knighted/jsx/jsx-runtime'
const fragmentSymbolDescription = `${runtimeModuleId}::Fragment`

const runtimeNotAvailable = () => {
  throw new Error(
    `The automatic JSX runtime is only published for TypeScript diagnostics. ` +
      `Render DOM nodes through the jsx tagged template exported by @knighted/jsx instead.`,
  )
}

export const Fragment: unique symbol = Symbol.for(fragmentSymbolDescription)

export function jsx(_: unknown, __?: unknown, ___?: unknown): JsxRenderable {
  return runtimeNotAvailable()
}

export function jsxs(_: unknown, __?: unknown, ___?: unknown): JsxRenderable {
  return runtimeNotAvailable()
}

export function jsxDEV(
  _: unknown,
  __?: unknown,
  ___?: unknown,
  ____?: boolean,
  _____?: unknown,
  ______?: unknown,
): JsxRenderable {
  return runtimeNotAvailable()
}

type DataAttributes = {
  [K in `data-${string}`]?: string | number | boolean | null | undefined
}

type AriaAttributes = {
  [K in `aria-${string}`]?: string | number | boolean | null | undefined
}
type JsxEventListener<EV extends Event> =
  | ((event: EV) => void)
  | { handleEvent(event: EV): void }

type JsxEventDescriptor<EV extends Event> = {
  handler: JsxEventListener<EV>
  capture?: boolean
  once?: boolean
  passive?: boolean
  signal?: AbortSignal
}

type JsxEventProp<EV extends Event> = JsxEventListener<EV> | JsxEventDescriptor<EV>

type EventHandlers<T extends EventTarget> = {
  [K in keyof GlobalEventHandlersEventMap as `on${Capitalize<string & K>}`]?: JsxEventProp<
    GlobalEventHandlersEventMap[K]
  >
} & {
  [K in keyof GlobalEventHandlersEventMap as `on${Capitalize<string & K>}Capture`]?: JsxEventProp<
    GlobalEventHandlersEventMap[K]
  >
} & {
  [K in string as K extends '' ? never : `on:${K}`]?: JsxEventProp<CustomEvent<unknown>>
} & {
  [K in string as K extends '' ? never : `on:${K}Capture`]?: JsxEventProp<
    CustomEvent<unknown>
  >
}

type ElementProps<Tag extends keyof HTMLElementTagNameMap> = Omit<
  Partial<HTMLElementTagNameMap[Tag]>,
  'children'
> &
  EventHandlers<HTMLElementTagNameMap[Tag]> &
  DataAttributes &
  AriaAttributes & {
    class?: string
    className?: string
    style?: string | Record<string, string | number>
    ref?:
      | ((value: HTMLElementTagNameMap[Tag]) => void)
      | { current: HTMLElementTagNameMap[Tag] | null }
    children?: JsxRenderable | JsxRenderable[]
  }

declare global {
  namespace JSX {
    type Element = JsxRenderable
    type IntrinsicElements = {
      [Tag in keyof HTMLElementTagNameMap]: ElementProps<Tag>
    }
  }
}
