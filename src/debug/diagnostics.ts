import {
  setAttributeDiagnosticsHooks,
  type AttributeDiagnosticsHooks,
} from '../internal/attribute-resolution.js'
import {
  setEventDiagnosticsHooks,
  type EventDiagnosticsHooks,
} from '../internal/event-bindings.js'
import {
  createDevError,
  describeValue,
  emitDevWarning,
  isDevEnvironment,
} from '../internal/dev-environment.js'

const isAsciiLowercase = (char: string) => char >= 'a' && char <= 'z'

export type JsxDiagnosticsMode = 'env' | 'always'

let diagnosticsMode: JsxDiagnosticsMode = 'env'

const shouldRunDiagnostics = () =>
  diagnosticsMode === 'always' || (diagnosticsMode === 'env' && isDevEnvironment())

const shouldForceWarnings = () => diagnosticsMode === 'always'

const attributeDiagnostics: AttributeDiagnosticsHooks = {
  warnLowercaseEventProp(name) {
    if (!shouldRunDiagnostics()) {
      return
    }

    if (!name.startsWith('on') || name.startsWith('on:') || name.length < 3) {
      return
    }

    const indicator = name[2] ?? ''
    if (!isAsciiLowercase(indicator)) {
      return
    }

    const suggestion = `${name.slice(0, 2)}${indicator.toUpperCase()}${name.slice(3)}`
    emitDevWarning(
      `Use camelCase DOM event props when targeting runtime jsx templates. Received "${name}"; did you mean "${suggestion}"?`,
      shouldForceWarnings(),
    )
  },
  ensureValidDangerouslySetInnerHTML(value) {
    if (!shouldRunDiagnostics()) {
      return
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw createDevError(
        'dangerouslySetInnerHTML expects an object with a string __html field.',
      )
    }

    const html = (value as { __html?: unknown }).__html
    if (typeof html !== 'string') {
      throw createDevError(
        `dangerouslySetInnerHTML.__html must be a string but received ${describeValue(html)}.`,
      )
    }
  },
}

const eventDiagnostics: EventDiagnosticsHooks = {
  onInvalidHandler(propName, value) {
    if (!shouldRunDiagnostics()) {
      return
    }

    throw createDevError(
      `The "${propName}" prop expects a function, EventListenerObject, or descriptor ({ handler }) but received ${describeValue(value)}.`,
    )
  },
}

export type EnableJsxDebugDiagnosticsOptions = {
  mode?: JsxDiagnosticsMode
}

export const enableJsxDebugDiagnostics = (options?: EnableJsxDebugDiagnosticsOptions) => {
  diagnosticsMode = options?.mode ?? 'env'
  setAttributeDiagnosticsHooks(attributeDiagnostics)
  setEventDiagnosticsHooks(eventDiagnostics)
}

export const disableJsxDebugDiagnostics = () => {
  setAttributeDiagnosticsHooks(null)
  setEventDiagnosticsHooks(null)
}
