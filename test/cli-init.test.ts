import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

let cli: typeof import('../src/cli/init')

beforeAll(async () => {
  process.env.KNIGHTED_JSX_CLI_TEST = '1'
  cli = await import('../src/cli/init')
})

describe('parseArgs', () => {
  it('parses defaults and flags', () => {
    const result = cli.parseArgs([
      '--dry-run',
      '--verbose',
      '--force',
      '--config',
      '--package-manager',
      'pnpm',
      '--wasm-package',
      '@custom/pkg@1.0.0',
    ])

    expect(result.dryRun).toBe(true)
    expect(result.verbose).toBe(true)
    expect(result.force).toBe(true)
    expect(result.skipConfig).toBe(false)
    expect(result.packageManager).toBe('pnpm')
    expect(result.wasmPackage).toBe('@custom/pkg@1.0.0')
  })
})

describe('detectPackageManager', () => {
  it('detects from lockfiles', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-pm-'))
    const npmLock = path.join(tmp, 'package-lock.json')
    fs.writeFileSync(npmLock, '{}')
    expect(cli.detectPackageManager(tmp)).toBe('npm')
    fs.unlinkSync(npmLock)

    const pnpmLock = path.join(tmp, 'pnpm-lock.yaml')
    fs.writeFileSync(pnpmLock, '')
    expect(cli.detectPackageManager(tmp)).toBe('pnpm')
  })
})

describe('persistBindingSpec', () => {
  it('records optionalDependency', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-pkg-'))
    const pkgPath = path.join(tmp, 'package.json')
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'tmp', version: '0.0.0' }, null, 2))

    cli.persistBindingSpec(
      tmp,
      '@oxc-parser/binding-wasm32-wasi',
      '^0.99.0',
      false,
      false,
    )

    const updated = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    expect(updated.optionalDependencies['@oxc-parser/binding-wasm32-wasi']).toBe(
      '^0.99.0',
    )
  })
})

describe('ensurePackageJson', () => {
  it('throws when package.json missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-missing-'))
    expect(() => cli.ensurePackageJson(tmp)).toThrow(/No package.json/)
  })
})

describe('maybeHandleConfigPrompt', () => {
  it('skips when flag set', async () => {
    const logs: string[] = []
    const originalLog = console.log
    console.log = msg => logs.push(String(msg))

    await cli.maybeHandleConfigPrompt(true, false)

    console.log = originalLog
    expect(logs.some(line => line.includes('Skipping loader config'))).toBe(true)
  })
})
