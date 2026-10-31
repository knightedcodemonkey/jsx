import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { beforeAll, describe, expect, it, vi } from 'vitest'

let cli: typeof import('../src/cli/init.js')

beforeAll(async () => {
  process.env.KNIGHTED_JSX_CLI_TEST = '1'
  cli = await import('../src/cli/init.js')
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
      '--wasm-version',
      '2.0.0',
    ])

    expect(result.dryRun).toBe(true)
    expect(result.verbose).toBe(true)
    expect(result.force).toBe(true)
    expect(result.skipConfig).toBe(false)
    expect(result.packageManager).toBe('pnpm')
    expect(result.wasmPackage).toBe('@custom/pkg@1.0.0')
    expect(result.wasmVersion).toBe('2.0.0')
    expect(result.wasmPackageSource).toBe('flag')
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

describe('readLocalOxcParserVersion', () => {
  it('prefers the parser colocated with @knighted/jsx over a hoisted copy', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-parser-local-'))
    const requireFromTmp = createRequire(path.join(tmp, 'package.json'))

    const jsxPkgDir = path.join(tmp, 'node_modules', '@knighted', 'jsx')
    fs.mkdirSync(jsxPkgDir, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'tmp' }))
    fs.writeFileSync(
      path.join(jsxPkgDir, 'package.json'),
      JSON.stringify({ name: '@knighted/jsx', version: '0.0.0' }),
    )

    const colocatedParser = path.join(jsxPkgDir, 'node_modules', 'oxc-parser')
    fs.mkdirSync(colocatedParser, { recursive: true })
    fs.writeFileSync(
      path.join(colocatedParser, 'package.json'),
      JSON.stringify({ name: 'oxc-parser', version: '9.9.9' }),
    )

    const hoistedParser = path.join(tmp, 'node_modules', 'oxc-parser')
    fs.mkdirSync(hoistedParser, { recursive: true })
    fs.writeFileSync(
      path.join(hoistedParser, 'package.json'),
      JSON.stringify({ name: 'oxc-parser', version: '0.7.8' }),
    )

    const version = cli.readLocalOxcParserVersion(requireFromTmp)
    expect(version).toBe('9.9.9')
  })

  it('falls back to a hoisted parser when no colocated copy exists', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-parser-hoisted-'))
    const requireFromTmp = createRequire(path.join(tmp, 'package.json'))

    const jsxPkgDir = path.join(tmp, 'node_modules', '@knighted', 'jsx')
    fs.mkdirSync(jsxPkgDir, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'tmp' }))
    fs.writeFileSync(
      path.join(jsxPkgDir, 'package.json'),
      JSON.stringify({ name: '@knighted/jsx', version: '0.0.0' }),
    )

    const hoistedParser = path.join(tmp, 'node_modules', 'oxc-parser')
    fs.mkdirSync(hoistedParser, { recursive: true })
    fs.writeFileSync(
      path.join(hoistedParser, 'package.json'),
      JSON.stringify({ name: 'oxc-parser', version: '0.7.8' }),
    )

    const version = cli.readLocalOxcParserVersion(requireFromTmp)
    expect(version).toBe('0.7.8')
  })
})

describe('resolveBindingSpec + fetchLatestBindingVersion', () => {
  it('applies explicit version overrides without fetching', () => {
    const fetchSpy = vi.fn()
    const resolved = cli.resolveBindingSpec('@scope/pkg', '1.2.3', fetchSpy)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(resolved.spec).toBe('@scope/pkg@1.2.3')
    expect(resolved.version).toBe('1.2.3')
  })

  it('fetches latest registry version when unspecified', () => {
    const resolved = cli.resolveBindingSpec('@scope/pkg', undefined, () => '9.9.9')

    expect(resolved.spec).toBe('@scope/pkg@9.9.9')
    expect(resolved.version).toBe('9.9.9')
  })

  it('skips registry lookups for non-registry specs', () => {
    const fetchSpy = vi.fn(() => '9.9.9')
    const resolved = cli.resolveBindingSpec('file:../local', undefined, fetchSpy)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(resolved.spec).toBe('file:../local')
    expect(resolved.version).toBeUndefined()
  })

  it('parses npm view output when fetching latest version', () => {
    const execSpy = vi.fn().mockReturnValue('"3.4.5"')
    const latest = cli.fetchLatestBindingVersion('@scope/pkg', execSpy as any)

    expect(latest).toBe('3.4.5')
    expect(execSpy).toHaveBeenCalled()
  })
})

describe('setup:wasm', () => {
  it.each([false, true])(
    'delegates dependency installation to npm with an existing binding: %s',
    existingBinding => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-setup-wasm-'))
      const npmScript = path.join(tmp, 'npm.cjs')
      const commandPath = path.join(tmp, 'command.json')
      const packagePath = path.join(tmp, 'package.json')
      const lockPath = path.join(tmp, 'package-lock.json')
      const nestedPackagePath = path.join(
        tmp,
        'node_modules/@oxc-parser/binding-wasm32-wasip1/node_modules/@emnapi/runtime/package.json',
      )
      const packageContent = JSON.stringify({ name: 'tmp', version: '0.0.0' })
      const lockContent = JSON.stringify({ lockfileVersion: 3 })
      const nestedContent = JSON.stringify({
        name: '@emnapi/runtime',
        version: '2.0.0-alpha.6',
      })
      fs.writeFileSync(packagePath, packageContent)
      fs.writeFileSync(lockPath, lockContent)
      fs.writeFileSync(
        npmScript,
        `require('node:fs').writeFileSync(${JSON.stringify(commandPath)}, JSON.stringify(process.argv.slice(2)))`,
      )
      if (existingBinding) {
        fs.mkdirSync(path.dirname(nestedPackagePath), { recursive: true })
        fs.writeFileSync(nestedPackagePath, nestedContent)
      }

      try {
        execFileSync(process.execPath, [path.resolve('scripts/setup-wasm.mjs')], {
          cwd: tmp,
          env: {
            ...process.env,
            npm_execpath: npmScript,
            WASM_BINDING_PACKAGE: '@oxc-parser/binding-wasm32-wasip1@0.156.0',
          },
          stdio: 'pipe',
        })

        expect(JSON.parse(fs.readFileSync(commandPath, 'utf8'))).toEqual([
          'install',
          '@oxc-parser/binding-wasm32-wasip1@0.156.0',
          '--no-save',
          '--ignore-scripts',
          '--include=optional',
        ])
        expect(fs.readFileSync(packagePath, 'utf8')).toBe(packageContent)
        expect(fs.readFileSync(lockPath, 'utf8')).toBe(lockContent)
        const nestedMetadata = fs.existsSync(nestedPackagePath)
          ? fs.readFileSync(nestedPackagePath, 'utf8')
          : undefined
        expect(nestedMetadata).toBe(existingBinding ? nestedContent : undefined)
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true })
      }
    },
  )
})

describe('installBinding', () => {
  it('does not install or modify dependencies in dry-run mode', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-binding-'))
    const spawner = vi.fn()
    try {
      const result = await cli.installBinding(
        'pkg@1.0.0',
        tmp,
        true,
        false,
        'npm',
        spawner,
      )
      expect(result.targetDir).toBe(path.join(tmp, 'node_modules', 'pkg'))
      expect(spawner).not.toHaveBeenCalled()
      expect(fs.existsSync(path.join(tmp, 'node_modules'))).toBe(false)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it.each([
    ['npm', 'install', '--save-exact'],
    ['pnpm', 'add', '--exact'],
    ['yarn', 'add', '--exact'],
    ['bun', 'add', '--exact'],
  ] as const)(
    'delegates the exact binding graph to %s',
    async (pm, command, exactFlag) => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-binding-graph-'))
      const nestedDir = path.join(tmp, 'node_modules/pkg/node_modules/@emnapi/runtime')
      const hostPath = path.join(tmp, 'package.json')
      const nestedPath = path.join(nestedDir, 'package.json')
      const hostContent = JSON.stringify({
        dependencies: { '@emnapi/runtime': '1.11.3' },
      })
      const nestedContent = JSON.stringify({ version: '2.0.0-alpha.6' })
      fs.mkdirSync(nestedDir, { recursive: true })
      fs.writeFileSync(hostPath, hostContent)
      fs.writeFileSync(nestedPath, nestedContent)
      const spawner = vi.fn().mockReturnValue({ status: 0 })

      try {
        await cli.installBinding('pkg@1.0.0', tmp, false, false, pm, spawner)
        expect(spawner).toHaveBeenCalledWith(pm, [command, 'pkg@1.0.0', exactFlag], {
          cwd: tmp,
          stdio: 'inherit',
        })
        expect(fs.readFileSync(hostPath, 'utf8')).toBe(hostContent)
        expect(fs.readFileSync(nestedPath, 'utf8')).toBe(nestedContent)
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true })
      }
    },
  )

  it('reports a failed package manager installation', async () => {
    const spawner = vi.fn().mockReturnValue({ status: 1 })
    await expect(
      cli.installBinding('pkg@1.0.0', '/tmp/project', false, false, 'npm', spawner),
    ).rejects.toThrow('Failed to install WASM binding with npm')
  })

  it('saves a version-scoped workaround without changing host runtime declarations', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-scoped-runtime-'))
    const pkgPath = path.join(tmp, 'package.json')
    const hostDependencies = { '@emnapi/core': '1.11.3', '@emnapi/runtime': '1.11.3' }
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ dependencies: hostDependencies, overrides: { tslib: '2.8.1' } }),
    )
    const spawner = vi.fn().mockReturnValue({ status: 0 })
    try {
      await cli.installBinding(
        '@oxc-parser/binding-wasm32-wasip1@0.156.0',
        tmp,
        false,
        false,
        'npm',
        spawner,
      )
      const content = fs.readFileSync(pkgPath, 'utf8')
      const pkg = JSON.parse(content)
      expect(pkg.dependencies).toEqual(hostDependencies)
      expect(pkg.overrides).toEqual({
        tslib: '2.8.1',
        '@oxc-parser/binding-wasm32-wasip1@0.156.0': {
          '@napi-rs/wasm-runtime': {
            '.': '1.2.5',
            '@emnapi/core': '2.0.0-alpha.6',
            '@emnapi/runtime': '2.0.0-alpha.6',
          },
        },
      })
      expect(spawner).toHaveBeenCalledWith(
        'npm',
        ['install', '@oxc-parser/binding-wasm32-wasip1@0.156.0', '--save-exact'],
        { cwd: tmp, stdio: 'inherit' },
      )
      await cli.installBinding(
        '@oxc-parser/binding-wasm32-wasip1@0.156.0',
        tmp,
        false,
        false,
        'npm',
        spawner,
      )
      expect(fs.readFileSync(pkgPath, 'utf8')).toBe(content)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('does not save the scoped workaround during a dry run', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-scoped-dry-'))
    const pkgPath = path.join(tmp, 'package.json')
    const content = JSON.stringify({ name: 'tmp' })
    fs.writeFileSync(pkgPath, content)
    const spawner = vi.fn()
    try {
      await cli.installBinding(
        '@oxc-parser/binding-wasm32-wasip1@0.156.0',
        tmp,
        true,
        false,
        'npm',
        spawner,
      )
      expect(fs.readFileSync(pkgPath, 'utf8')).toBe(content)
      expect(spawner).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it.each(['pnpm', 'yarn', 'bun'] as const)(
    'rejects the affected binding under %s before changing the project',
    async pm => {
      const spawner = vi.fn()
      await expect(
        cli.installBinding(
          '@oxc-parser/binding-wasm32-wasip1@0.156.0',
          '/tmp/project',
          false,
          false,
          pm,
          spawner,
        ),
      ).rejects.toThrow('requires a tested npm-scoped runtime override')
      expect(spawner).not.toHaveBeenCalled()
    },
  )

  it.each([
    '@oxc-parser/binding-wasm32-wasip1@0.156.0',
    '@oxc-parser/binding-wasm32-wasip1',
  ])('rejects conflicting host override %s without modifying it', async key => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-conflicting-policy-'))
    const pkgPath = path.join(tmp, 'package.json')
    const content = JSON.stringify({ name: 'tmp', overrides: { [key]: '0.154.0' } })
    fs.writeFileSync(pkgPath, content)
    const spawner = vi.fn()
    try {
      await expect(
        cli.installBinding(
          '@oxc-parser/binding-wasm32-wasip1@0.156.0',
          tmp,
          false,
          false,
          'npm',
          spawner,
        ),
      ).rejects.toThrow('Conflicting')
      expect(fs.readFileSync(pkgPath, 'utf8')).toBe(content)
      expect(spawner).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
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
      wasmVersion: undefined,
      wasmPackageSource: 'flag' as const,
    }

    const parseArgs = vi.fn().mockReturnValue(options)
    const ensurePackageJson = vi.fn()
    const detectPackageManager = vi.fn().mockReturnValue('pnpm')
    const installBinding = vi.fn().mockResolvedValue({
      targetDir: '/tmp/project/node_modules/pkg',
      name: 'pkg',
      version: '1.0.0',
    })
    const verifyBinding = vi
      .fn()
      .mockResolvedValue('/tmp/project/node_modules/pkg/index.js')
    const maybeHandleConfigPrompt = vi.fn().mockResolvedValue(undefined)
    const logs: string[] = []
    const log = vi.fn((message: string) => {
      logs.push(String(message))
    })
    const resolveBindingSpec = vi.fn().mockReturnValue({
      spec: 'pkg@1.0.0',
      name: 'pkg',
      version: '1.0.0',
    })

    await cli.main({
      parseArgs,
      ensurePackageJson,
      detectPackageManager,
      installBinding,
      verifyBinding,
      maybeHandleConfigPrompt,
      resolveBindingSpec,
      readLocalOxcParserVersion: vi.fn().mockReturnValue('9.9.9'),
      log,
    })

    expect(ensurePackageJson).toHaveBeenCalledWith(options.cwd)
    expect(detectPackageManager).toHaveBeenCalledWith(options.cwd, options.packageManager)
    expect(resolveBindingSpec).toHaveBeenCalledWith(
      options.wasmPackage,
      options.wasmVersion,
    )
    expect(installBinding).toHaveBeenCalledWith(
      'pkg@1.0.0',
      options.cwd,
      options.dryRun,
      options.verbose,
      'pnpm',
    )
    expect(verifyBinding).toHaveBeenCalled()
    expect(maybeHandleConfigPrompt).toHaveBeenCalledWith(
      options.skipConfig,
      options.force,
    )
    expect(logs.at(-1)).toContain('Verified import')
  })

  it('aligns the default binding with the bundled parser version', async () => {
    const options = {
      cwd: '/tmp/project',
      dryRun: false,
      verbose: false,
      force: false,
      skipConfig: true,
      packageManager: 'pnpm' as const,
      wasmPackage: '@oxc-parser/binding-wasm32-wasip1',
      wasmVersion: undefined,
      wasmPackageSource: 'default' as const,
    }

    const parseArgs = vi.fn().mockReturnValue(options)
    const ensurePackageJson = vi.fn()
    const detectPackageManager = vi.fn().mockReturnValue('pnpm')
    const installBinding = vi.fn().mockResolvedValue({
      targetDir: '/tmp/project/node_modules/@oxc-parser/binding-wasm32-wasip1',
      name: '@oxc-parser/binding-wasm32-wasip1',
      version: '0.156.0',
    })
    const verifyBinding = vi.fn().mockResolvedValue('resolved.js')
    const maybeHandleConfigPrompt = vi.fn().mockResolvedValue(undefined)
    const resolveBindingSpec = vi.fn().mockReturnValue({
      spec: '@oxc-parser/binding-wasm32-wasip1@0.156.0',
      name: '@oxc-parser/binding-wasm32-wasip1',
      version: '0.156.0',
    })
    const readLocalOxcParserVersion = vi.fn().mockReturnValue('0.156.0')

    await cli.main({
      parseArgs,
      ensurePackageJson,
      detectPackageManager,
      installBinding,
      verifyBinding,
      maybeHandleConfigPrompt,
      resolveBindingSpec,
      readLocalOxcParserVersion,
    })

    expect(resolveBindingSpec).toHaveBeenCalledWith(options.wasmPackage, '0.156.0')
    expect(installBinding).toHaveBeenCalledWith(
      '@oxc-parser/binding-wasm32-wasip1@0.156.0',
      options.cwd,
      options.dryRun,
      options.verbose,
      'pnpm',
    )
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
    await import('../src/cli/init.js')

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
    await import('../src/cli/init.js')

    const patchedEmit = process.emitWarning
    patchedEmit('WASI is an experimental feature', 'ExperimentalWarning')
    expect(emitSpy).not.toHaveBeenCalled()

    patchedEmit('Different warning', 'ExperimentalWarning')
    expect(emitSpy).toHaveBeenCalledWith('Different warning', 'ExperimentalWarning')

    process.emitWarning = originalEmit
    process.env.KNIGHTED_JSX_CLI_TEST = previousEnv
  })
})
