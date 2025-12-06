const GLOBAL_KEYS = [
  'window',
  'self',
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'DocumentFragment',
  'customElements',
  'Text',
  'Comment',
  'MutationObserver',
  'navigator',
] as const

export type GlobalKey = (typeof GLOBAL_KEYS)[number]

export type SnapshotEntry = { exists: boolean; value: unknown }

export type GlobalsSnapshot = Map<GlobalKey, SnapshotEntry>

export const snapshotGlobals = (): GlobalsSnapshot => {
  const target = globalThis as Record<string, unknown>
  const snapshot = new Map<GlobalKey, SnapshotEntry>()

  GLOBAL_KEYS.forEach(key => {
    snapshot.set(key, {
      exists: Object.prototype.hasOwnProperty.call(target, key),
      value: target[key],
    })
  })

  return snapshot
}

export const removeGlobals = () => {
  const target = globalThis as Record<string, unknown>
  GLOBAL_KEYS.forEach(key => {
    target[key] = undefined
  })
}

export const restoreGlobals = (snapshot: GlobalsSnapshot) => {
  const target = globalThis as Record<string, unknown>

  GLOBAL_KEYS.forEach(key => {
    const entry = snapshot.get(key)
    if (!entry) {
      delete target[key]
      return
    }

    if (!entry.exists) {
      delete target[key]
      return
    }

    target[key] = entry.value
  })
}
