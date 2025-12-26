const DEV_PREFIX = '@knighted/jsx'

const formatDevMessage = (message: string) => `${DEV_PREFIX}: ${message}`

export const isDevEnvironment = () =>
  typeof process !== 'undefined' && process.env?.KNIGHTED_JSX_DEBUG === '1'

export const describeValue = (value: unknown) => {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'function') {
    return value.name ? `function ${value.name}` : 'function'
  }

  if (Array.isArray(value)) {
    return 'array'
  }

  if (typeof value === 'object') {
    const ctor = (value as { constructor?: { name?: string } }).constructor
    if (ctor && typeof ctor.name === 'string' && ctor.name && ctor.name !== 'Object') {
      return `${ctor.name} instance`
    }
    return 'object'
  }

  return typeof value
}

export const createDevError = (message: string) => new Error(formatDevMessage(message))

export const emitDevWarning = (message: string, force = false) => {
  if (!force && !isDevEnvironment()) {
    return
  }

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(formatDevMessage(message))
  }
}
