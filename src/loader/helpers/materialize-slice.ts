import { parseRangeKey } from './parse-range-key.js'

export const materializeSlice = (
  start: number,
  end: number,
  source: string,
  replacements: Map<string, string>,
) => {
  const exact = replacements.get(`${start}:${end}`)
  if (exact !== undefined) {
    return exact
  }

  const nested: Array<{ start: number; end: number; code: string }> = []
  replacements.forEach((code, key) => {
    const range = parseRangeKey(key)
    if (!range) return
    const [rStart, rEnd] = range
    if (rStart >= start && rEnd <= end) {
      nested.push({ start: rStart, end: rEnd, code })
    }
  })

  if (!nested.length) {
    return source.slice(start, end)
  }

  nested.sort((a, b) => a.start - b.start)
  let cursor = start
  let output = ''

  nested.forEach(entry => {
    if (entry.start < cursor) {
      return
    }
    output += source.slice(cursor, entry.start)
    output += entry.code
    cursor = entry.end
  })

  output += source.slice(cursor, end)
  return output
}
