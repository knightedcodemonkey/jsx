import { cp, mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const resolvePath = relative => {
  const current = fileURLToPath(import.meta.url)
  return path.resolve(path.dirname(current), '..', relative)
}

const source = resolvePath('dist')
const target = resolvePath('examples/vendor/@knighted/jsx')

const ensureDistExists = async () => {
  try {
    await stat(source)
  } catch (error) {
    if (
      (error && 'code' in error && error.code === 'ENOENT') ||
      error?.name === 'ENOENT'
    ) {
      throw new Error(
        'Build output missing. Run "npm run build" before syncing examples.',
      )
    }
    throw error
  }
}

const syncExamples = async () => {
  await ensureDistExists()
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  await cp(source, target, { recursive: true })
  console.log('Synced dist/ -> examples/vendor/@knighted/jsx')
}

syncExamples().catch(error => {
  console.error('[sync-examples]', error)
  process.exitCode = 1
})
