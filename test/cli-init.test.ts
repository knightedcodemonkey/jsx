import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { create } from 'tar'

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
    const hadUA = Object.prototype.hasOwnProperty.call(
      process.env,
      'npm_config_user_agent',
    )
    const originalUA = process.env.npm_config_user_agent
    process.env.npm_config_user_agent = ''
    const npmLock = path.join(tmp, 'package-lock.json')
    fs.writeFileSync(npmLock, '{}')
    expect(cli.detectPackageManager(tmp)).toBe('npm')
    fs.unlinkSync(npmLock)

    const pnpmLock = path.join(tmp, 'pnpm-lock.yaml')
    fs.writeFileSync(pnpmLock, '')
    expect(cli.detectPackageManager(tmp)).toBe('pnpm')

    if (hadUA) {
      process.env.npm_config_user_agent = originalUA
    } else {
      delete process.env.npm_config_user_agent
    }
  })
})

describe('installRuntimeDeps', () => {
  it('returns missing deps without installing when dry-run', () => {
    const missing = cli.installRuntimeDeps(
      'npm',
      ['dep-a', 'dep-b'],
      process.cwd(),
      true,
      true,
    )
    expect(missing).toEqual(['dep-a', 'dep-b'])
  })

  it('skips when deps already installed', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-installed-'))
    fs.mkdirSync(path.join(tmp, 'node_modules', 'dep-a'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'node_modules', 'dep-a', 'index.js'),
      'module.exports = {}',
    )
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'tmp', version: '0.0.0' }),
    )

    const missing = cli.installRuntimeDeps('npm', ['dep-a'], tmp, false, false)
    expect(missing).toEqual([])
  })
})

describe('installBinding + verifyBinding (dry-run)', () => {
  it('packs and installs into target dir in dry-run mode', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-binding-'))

    const packSpy = vi.spyOn(cli, 'runNpmPack').mockReturnValue('fake.tgz')

    const result = await cli.installBinding('pkg@1.0.0', tmp, true, false)
    expect(result.targetDir).toBe(path.join(tmp, 'node_modules', 'pkg'))
    expect(result.tarballPath).toBeUndefined()

    packSpy.mockRestore()
  })

  it('extracts tarball on real install', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-binding-real-'))
    const tarballName = 'pkg-1.0.0.tgz'
    const tarballPath = path.join(tmp, tarballName)

    const payloadDir = path.join(tmp, 'payload')
    fs.mkdirSync(path.join(payloadDir, 'package'), { recursive: true })
    fs.writeFileSync(path.join(payloadDir, 'package', 'file.txt'), 'hello')
    await create({ file: tarballPath, cwd: payloadDir }, ['package/file.txt'])

    const packSpy = vi.spyOn(cli, 'runNpmPack').mockReturnValue(tarballName)

    const result = await cli.installBinding('pkg', tmp, false, false)
    expect(result.targetDir).toBe(path.join(tmp, 'node_modules', 'pkg'))
    expect(fs.existsSync(result.targetDir)).toBe(true)

    packSpy.mockRestore()
  })
})

describe('verifyBinding (mocked)', () => {
  it('attempts to resolve and import module', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-verify-'))
    const pkgPath = path.join(tmp, 'package.json')
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ name: 'tmp', version: '0.0.0', type: 'module' }, null, 2),
    )

    const modDir = path.join(tmp, 'node_modules', 'dummy')
    fs.mkdirSync(modDir, { recursive: true })
    const dummyModulePath = path.join(modDir, 'index.mjs')
    fs.writeFileSync(dummyModulePath, 'export const ok = true')
    fs.writeFileSync(
      path.join(modDir, 'package.json'),
      JSON.stringify({
        name: 'dummy',
        version: '0.0.0',
        type: 'module',
        main: './index.mjs',
      }),
    )

    await expect(cli.verifyBinding('dummy', tmp, false)).resolves.toContain('index.mjs')
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

  it('logs helper message when opting in with force', async () => {
    const logs: string[] = []
    const originalLog = console.log
    const originalTty = process.stdin.isTTY
    ;(process.stdin as typeof process.stdin & { isTTY?: boolean }).isTTY = true
    console.log = msg => logs.push(String(msg))

    await cli.maybeHandleConfigPrompt(false, true)

    console.log = originalLog
    ;(process.stdin as typeof process.stdin & { isTTY?: boolean }).isTTY = originalTty
    expect(logs.some(line => line.includes('Loader assistance is interactive'))).toBe(
      true,
    )
  })
})

describe('runNpmPack', () => {
  it('returns sanitized tarball name in dry-run', () => {
    const name = cli.runNpmPack('@scope/pkg@1.0.0', '/tmp', true, false)
    expect(name.endsWith('.tgz')).toBe(true)
    expect(name.includes('@')).toBe(false)
  })
})
