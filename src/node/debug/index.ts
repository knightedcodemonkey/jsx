import { enableJsxDebugDiagnostics } from '../../debug/diagnostics.js'
import { ensureNodeDom } from '../bootstrap.js'
import { jsx as baseJsx } from '../../jsx.js'

enableJsxDebugDiagnostics({ mode: 'always' })
ensureNodeDom()

export const jsx = baseJsx
export type { JsxRenderable, JsxComponent } from '../../jsx.js'
