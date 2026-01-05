export const parseRangeKey = (key: string): [number, number] | null => {
  const [start, end] = key.split(':').map(entry => Number.parseInt(entry, 10))

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null
  }

  if (end < start) {
    return null
  }

  return [start, end]
}
