export const normalizeJsxText = (value: string): string | null => {
  const collapsed = value.replace(/\r/g, '').replace(/\n\s+/g, ' ')
  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? ''
  const trailingWhitespace = value.match(/\s*$/)?.[0] ?? ''
  const trimStart = /\n/.test(leadingWhitespace)
  const trimEnd = /\n/.test(trailingWhitespace)

  let normalized = collapsed
  if (trimStart) {
    normalized = normalized.replace(/^\s+/, '')
  }
  if (trimEnd) {
    normalized = normalized.replace(/\s+$/, '')
  }

  if (normalized.length === 0 || normalized.trim().length === 0) {
    return null
  }

  return normalized
}
