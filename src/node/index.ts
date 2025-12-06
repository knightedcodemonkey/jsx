import { ensureNodeDom } from './bootstrap.js'
import { jsx as baseJsx } from '../jsx.js'

await ensureNodeDom()

export const jsx = baseJsx
export type { JsxRenderable, JsxComponent } from '../jsx.js'
