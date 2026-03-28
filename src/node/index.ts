import { ensureNodeDom } from './bootstrap.js'
import { jsx as baseJsx } from '../jsx.js'

ensureNodeDom()

export const jsx = baseJsx
export type { JsxRenderable, JsxChildren, JsxComponent } from '../jsx.js'
