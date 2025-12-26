import { statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const budgets = [
  {
    label: 'standard runtime',
    relativePath: 'dist/jsx.js',
    maxBytes: 16 * 1024, // 16 kB budget for the main runtime entry
  },
  {
    label: 'lite runtime',
    relativePath: 'dist/lite/index.js',
    maxBytes: 16 * 1024, // 16 kB budget for the lite entry
  },
]

const formatBytes = bytes => `${bytes} B (${(bytes / 1024).toFixed(2)} KiB)`
const results = budgets.map(entry => {
  const resolvedPath = path.join(rootDir, entry.relativePath)
  let bytes

  try {
    bytes = statSync(resolvedPath).size
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    throw new Error(
      `Unable to read ${entry.relativePath}. Did you run "npm run build"?\n${err.message}`,
    )
  }

  return { ...entry, bytes }
})
const violations = results.filter(result => result.bytes > result.maxBytes)

results.forEach(result => {
  const status = result.bytes > result.maxBytes ? '✖' : '✔'
  const limitText = formatBytes(result.maxBytes)
  const sizeText = formatBytes(result.bytes)
  console.log(`${status} ${result.label}: ${sizeText} (limit ${limitText})`)
})

if (violations.length) {
  const detail = violations
    .map(result => `${result.label} exceeds limit by ${result.bytes - result.maxBytes} B`)
    .join('\n')
  throw new Error(`Bundle size check failed:\n${detail}`)
}
