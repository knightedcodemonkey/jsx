import { enableJsxDebugDiagnostics } from './diagnostics.js'

enableJsxDebugDiagnostics({ mode: 'always' })

export { jsx } from '../jsx.js'
export type { JsxRenderable, JsxChildren, JsxComponent } from '../jsx.js'
