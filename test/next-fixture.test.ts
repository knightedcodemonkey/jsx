import { rm, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '..')
const fixtureDir = path.resolve(rootDir, 'test/fixtures/next-app')
const distEntry = path.join(rootDir, 'dist/index.js')
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const nextBin = path.join(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'next.cmd' : 'next',
)

const runCommand = (
  bin: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) =>
  new Promise<void>((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...options.env }

    // Drop undefined env entries to avoid Windows EINVAL from spawn.
    for (const key of Object.keys(env)) {
      if (env[key] === undefined) {
        delete env[key]
      }
    }

    const child = spawn(bin, args, {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    let stderr = ''

    child.stderr?.on('data', chunk => {
      stderr += chunk
    })

    child.on('close', code => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`Command failed: ${bin} ${args.join(' ')}\n${stderr}`))
    })
  })

const ensureDistArtifacts = async () => {
  try {
    await access(distEntry)
  } catch {
    await runCommand(npmBin, ['run', 'build'], { cwd: rootDir })
  }
}

describe('Next.js fixture', () => {
  it('builds and exports a hybrid page', async () => {
    await ensureDistArtifacts()
    await Promise.all([
      rm(path.join(fixtureDir, '.next'), { recursive: true, force: true }),
      rm(path.join(fixtureDir, 'out'), { recursive: true, force: true }),
    ])

    const env = {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_ENV: 'production' as const,
    }

    await runCommand(nextBin, ['build', '--webpack'], { cwd: fixtureDir, env })

    const html = await readFile(path.join(fixtureDir, 'out/index.html'), 'utf8')
    expect(html).toContain('Next.js hybrid demo')
    expect(html).toContain('React badge clicks')
    expect(html).toContain('DOM runtime placeholder')
  }, 180_000)
})
