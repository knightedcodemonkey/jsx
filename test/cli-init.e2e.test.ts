import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CLI_BIN = path.resolve(__dirname, '../dist/cli/init.js')

function setupProject() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-e2e-'))
  const pkgJson = {
    name: 'cli-e2e',
    version: '0.0.0',
    type: 'module',
  }
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify(pkgJson, null, 2),
  )
  return projectDir
}

describe('cli init e2e (dist binary)', () => {
  it('runs via node with dry-run flags', () => {
    const projectDir = setupProject()

    const result = spawnSync(
      process.execPath,
      [
        CLI_BIN,
        '--dry-run',
        '--skip-config',
        '--package-manager',
        'npm',
        '--wasm-package',
        '@scope/pkg@1.0.0',
      ],
      {
        cwd: projectDir,
        encoding: 'utf8',
        env: { ...process.env, KNIGHTED_JSX_CLI_TEST: '0' },
      },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Done!')
    expect(result.stdout).toContain('Runtime deps installed')
    expect(result.stderr).toBe('')
  })
})
