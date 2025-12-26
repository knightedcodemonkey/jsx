import { createDevError, describeValue, isDevEnvironment } from './dev-environment.js'

const captureSuffix = 'Capture'

export type ParsedEventBinding = {
  eventName: string
  capture: boolean
}

const stripCaptureSuffix = (rawName: string): ParsedEventBinding => {
  if (rawName.endsWith(captureSuffix)) {
    return { eventName: rawName.slice(0, -captureSuffix.length), capture: true }
  }

  return { eventName: rawName, capture: false }
}

export const parseEventPropName = (name: string): ParsedEventBinding | null => {
  if (!name.startsWith('on')) {
    return null
  }

  if (name.startsWith('on:')) {
    const raw = name.slice(3)
    if (!raw) {
      return null
    }
    const parsed = stripCaptureSuffix(raw)
    if (!parsed.eventName) {
      return null
    }
    return parsed
  }

  const raw = name.slice(2)
  if (!raw) {
    return null
  }

  const parsed = stripCaptureSuffix(raw)
  if (!parsed.eventName) {
    return null
  }

  return {
    eventName: parsed.eventName.toLowerCase(),
    capture: parsed.capture,
  }
}

const isEventListenerObject = (value: unknown): value is EventListenerObject => {
  if (!value || typeof value !== 'object') {
    return false
  }

  return (
    'handleEvent' in (value as Record<string, unknown>) &&
    typeof (value as EventListenerObject).handleEvent === 'function'
  )
}

export type EventHandlerDescriptor = {
  handler: EventListenerOrEventListenerObject
  capture?: boolean
  once?: boolean
  passive?: boolean
  signal?: AbortSignal | null
  options?: AddEventListenerOptions
}

const isEventHandlerDescriptor = (value: unknown): value is EventHandlerDescriptor => {
  if (!value || typeof value !== 'object' || !('handler' in value)) {
    return false
  }

  const handler = (value as EventHandlerDescriptor).handler
  if (typeof handler === 'function') {
    return true
  }

  return isEventListenerObject(handler)
}

export type ResolvedEventHandler = {
  listener: EventListenerOrEventListenerObject
  options?: AddEventListenerOptions
}

const throwInvalidHandlerError = (propName: string, value: unknown) => {
  if (!isDevEnvironment()) {
    return
  }

  throw createDevError(
    `The "${propName}" prop expects a function, EventListenerObject, or descriptor ({ handler }) but received ${describeValue(value)}.`,
  )
}

export const resolveEventHandlerValue = (
  propName: string,
  value: unknown,
): ResolvedEventHandler | null => {
  if (typeof value === 'function' || isEventListenerObject(value)) {
    return { listener: value as EventListenerOrEventListenerObject }
  }

  if (!isEventHandlerDescriptor(value)) {
    throwInvalidHandlerError(propName, value)
    return null
  }

  const descriptor = value
  let options = descriptor.options ? { ...descriptor.options } : undefined

  const assignOption = <K extends keyof AddEventListenerOptions>(
    key: K,
    optionValue: AddEventListenerOptions[K] | null | undefined,
  ) => {
    if (optionValue === undefined || optionValue === null) {
      return
    }
    if (!options) {
      options = {}
    }
    options[key] = optionValue
  }

  assignOption('capture', descriptor.capture)
  assignOption('once', descriptor.once)
  assignOption('passive', descriptor.passive)
  assignOption('signal', descriptor.signal ?? undefined)

  return {
    listener: descriptor.handler,
    options,
  }
}
