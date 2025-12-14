import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
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

  it('re-applies skip-config flag when requested explicitly', () => {
    const result = cli.parseArgs(['--config', '--skip-config'])
    expect(result.skipConfig).toBe(true)
  })

  it('throws on unsupported package managers', () => {
    expect(() => cli.parseArgs(['--package-manager', 'unknown'])).toThrow(
      /Unsupported package manager/,
    )
  })

  it('prints help output and exits', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code ?? 0}`)
    }) as never)

    expect(() => cli.parseArgs(['--help'])).toThrow(/exit 0/)
    expect(logSpy).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)

    logSpy.mockRestore()
    exitSpy.mockRestore()
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

  it('falls back to npm when no hints exist', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-pm-default-'))
    const hadUA = Object.prototype.hasOwnProperty.call(
      process.env,
      'npm_config_user_agent',
    )
    const originalUA = process.env.npm_config_user_agent
    process.env.npm_config_user_agent = ''

    expect(cli.detectPackageManager(tmp)).toBe('npm')

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

  it('throws when the package manager install fails', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-install-fail-'))
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'tmp', version: '0.0.0' }),
    )

    const failingSpawner = vi.fn().mockReturnValue({ status: 1 } as any)

    expect(() =>
      cli.installRuntimeDeps('npm', ['missing-dep'], tmp, false, false, failingSpawner),
    ).toThrow(/Failed to install runtime dependencies/)
  })
})

describe('installBinding + verifyBinding (dry-run)', () => {
  it('packs and installs into target dir in dry-run mode', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-binding-'))
    const packMock = vi.fn().mockReturnValue('fake.tgz')
    const result = await cli.installBinding('pkg@1.0.0', tmp, true, false, packMock)

    expect(result.targetDir).toBe(path.join(tmp, 'node_modules', 'pkg'))
    expect(result.tarballPath).toBeUndefined()
    expect(packMock).toHaveBeenCalled()
  })

  it('extracts tarball on real install', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-binding-real-'))
    const tarballName = 'pkg-1.0.0.tgz'
    const tarballPath = path.join(tmp, tarballName)

    const payloadDir = path.join(tmp, 'payload')
    fs.mkdirSync(path.join(payloadDir, 'package'), { recursive: true })
    fs.writeFileSync(path.join(payloadDir, 'package', 'file.txt'), 'hello')
    await create({ file: tarballPath, cwd: payloadDir }, ['package/file.txt'])

    const packMock = vi.fn().mockReturnValue(tarballName)

    const result = await cli.installBinding('pkg', tmp, false, false, packMock)
    expect(result.targetDir).toBe(path.join(tmp, 'node_modules', 'pkg'))
    expect(fs.existsSync(result.targetDir)).toBe(true)

    expect(packMock).toHaveBeenCalled()
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

  it('throws when importer returns an empty module namespace', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-verify-empty-'))
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

    await expect(
      cli.verifyBinding('dummy', tmp, false, async () => undefined),
    ).rejects.toThrow(/verification failed/)
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

  it('skips package.json updates when version is missing', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    cli.persistBindingSpec(process.cwd(), '@scope/pkg', undefined, false, true)

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping package.json update (no version parsed)'),
    )

    logSpy.mockRestore()
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
    expect(logs.some(line => line.includes('Example loader config'))).toBe(true)
    expect(logs.some(line => line.includes("tags: ['jsx', 'reactJsx']"))).toBe(true)
  })

  it('logs when a user declines loader help', async () => {
    const logs: string[] = []
    const originalLog = console.log
    console.log = msg => logs.push(String(msg))

    const originalTty = process.stdin.isTTY
    ;(process.stdin as typeof process.stdin & { isTTY?: boolean }).isTTY = true

    const question = vi.fn().mockResolvedValue('n')
    const close = vi.fn().mockResolvedValue(undefined)
    const rl = {
      question,
      close,
    } as unknown as ReturnType<typeof readline.createInterface>
    const createInterfaceSpy = vi.spyOn(readline, 'createInterface').mockReturnValue(rl)

    await cli.maybeHandleConfigPrompt(false, false)

    expect(
      logs.some(line => line.includes('Skipping loader config per your choice.')),
    ).toBe(true)

    createInterfaceSpy.mockRestore()
    console.log = originalLog
    ;(process.stdin as typeof process.stdin & { isTTY?: boolean }).isTTY = originalTty
  })
})

describe('promptYesNo', () => {
  it('accepts interactive yes answers', async () => {
    const question = vi.fn().mockResolvedValue('Y')
    const close = vi.fn().mockResolvedValue(undefined)
    const rl = {
      question,
      close,
    } as unknown as ReturnType<typeof readline.createInterface>
    const createInterfaceSpy = vi.spyOn(readline, 'createInterface').mockReturnValue(rl)
    const originalTty = process.stdin.isTTY
    ;(process.stdin as typeof process.stdin & { isTTY?: boolean }).isTTY = true

    const result = await cli.promptYesNo('ok?', false, false)
    expect(result).toBe(true)
    expect(question).toHaveBeenCalled()

    createInterfaceSpy.mockRestore()
    ;(process.stdin as typeof process.stdin & { isTTY?: boolean }).isTTY = originalTty
  })

  it('falls back to the default when the answer is blank', async () => {
    const question = vi.fn().mockResolvedValue('   ')
    const close = vi.fn().mockResolvedValue(undefined)
    const rl = {
      question,
      close,
    } as unknown as ReturnType<typeof readline.createInterface>
    const createInterfaceSpy = vi.spyOn(readline, 'createInterface').mockReturnValue(rl)
    const originalTty = process.stdin.isTTY
    ;(process.stdin as typeof process.stdin & { isTTY?: boolean }).isTTY = true

    const result = await cli.promptYesNo('ok?', true, false)
    expect(result).toBe(true)

    createInterfaceSpy.mockRestore()
    ;(process.stdin as typeof process.stdin & { isTTY?: boolean }).isTTY = originalTty
  })
})

describe('runNpmPack', () => {
  it('returns sanitized tarball name in dry-run', () => {
    const name = cli.runNpmPack('@scope/pkg@1.0.0', '/tmp', true, false)
    expect(name.endsWith('.tgz')).toBe(true)
    expect(name.includes('@')).toBe(false)
  })

  it('parses npm output when not running in dry mode', () => {
    const execStub = vi.fn().mockReturnValue('notice\npkg-1.0.0.tgz\n')

    const result = cli.runNpmPack('pkg', process.cwd(), false, false, execStub as any)
    expect(result).toBe('pkg-1.0.0.tgz')
  })
})

describe('main (overrides)', () => {
  it('runs the happy path with injected dependencies', async () => {
    const options = {
      cwd: '/tmp/project',
      dryRun: false,
      verbose: false,
      force: false,
      skipConfig: false,
      packageManager: 'npm' as const,
      wasmPackage: 'pkg@1.0.0',
    }

    const parseArgs = vi.fn().mockReturnValue(options)
    const ensurePackageJson = vi.fn()
    const detectPackageManager = vi.fn().mockReturnValue('pnpm')
    const installRuntimeDeps = vi.fn().mockReturnValue(['dep-a'])
    const installBinding = vi.fn().mockResolvedValue({
      targetDir: '/tmp/project/node_modules/pkg',
      name: 'pkg',
      version: '1.0.0',
    })
    const persistBindingSpec = vi.fn()
    const verifyBinding = vi
      .fn()
      .mockResolvedValue('/tmp/project/node_modules/pkg/index.js')
    const maybeHandleConfigPrompt = vi.fn().mockResolvedValue(undefined)
    const logs: string[] = []
    const log = vi.fn((message: string) => {
      logs.push(String(message))
    })

    await cli.main({
      parseArgs,
      ensurePackageJson,
      detectPackageManager,
      installRuntimeDeps,
      installBinding,
      persistBindingSpec,
      verifyBinding,
      maybeHandleConfigPrompt,
      log,
    })

    expect(ensurePackageJson).toHaveBeenCalledWith(options.cwd)
    expect(detectPackageManager).toHaveBeenCalledWith(options.cwd, options.packageManager)
    expect(installRuntimeDeps).toHaveBeenCalledWith(
      'pnpm',
      expect.any(Array),
      options.cwd,
      options.dryRun,
      options.verbose,
    )
    expect(persistBindingSpec).toHaveBeenCalledWith(
      options.cwd,
      'pkg',
      '1.0.0',
      options.dryRun,
      options.verbose,
    )
    expect(verifyBinding).toHaveBeenCalled()
    expect(maybeHandleConfigPrompt).toHaveBeenCalledWith(
      options.skipConfig,
      options.force,
    )
    expect(logs.at(-1)).toContain('Verified import')
  })
})

describe('module entrypoint guard', () => {
  it('logs errors when main rejects outside of test mode', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-guard-'))
    const previousEnv = process.env.KNIGHTED_JSX_CLI_TEST
    const previousCwd = process.cwd()
    const previousArgv = process.argv
    const previousExitCode = process.exitCode
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.resetModules()
    process.env.KNIGHTED_JSX_CLI_TEST = '0'
    process.argv = ['node', 'cli']
    process.chdir(tmp)
    await import('../src/cli/init')

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to set up WASM binding:',
      expect.stringContaining('No package.json found'),
    )
    expect(process.exitCode).toBe(1)

    process.env.KNIGHTED_JSX_CLI_TEST = previousEnv
    process.chdir(previousCwd)
    process.argv = previousArgv
    process.exitCode = previousExitCode
    errorSpy.mockRestore()
  })
})

describe('suppressExperimentalWasiWarning', () => {
  it('filters the noisy warning based on message + type', async () => {
    const originalEmit = process.emitWarning
    const emitSpy = vi.fn()
    process.emitWarning = emitSpy as typeof process.emitWarning
    const previousEnv = process.env.KNIGHTED_JSX_CLI_TEST

    vi.resetModules()
    process.env.KNIGHTED_JSX_CLI_TEST = '1'
    await import('../src/cli/init')

    const patchedEmit = process.emitWarning
    patchedEmit('WASI is an experimental feature', 'ExperimentalWarning')
    expect(emitSpy).not.toHaveBeenCalled()

    patchedEmit('Different warning', 'ExperimentalWarning')
    expect(emitSpy).toHaveBeenCalledWith('Different warning', 'ExperimentalWarning')

    process.emitWarning = originalEmit
    process.env.KNIGHTED_JSX_CLI_TEST = previousEnv
  })
})
