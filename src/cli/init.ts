import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { applyWasmRuntimePolicy } from './wasm-runtime-policy.js'

const CLI_REQUIRE = createRequire(
  typeof __filename !== 'undefined' ? __filename : path.join(process.cwd(), 'noop.js'),
)
const DEFAULT_BINDING_PACKAGE_NAME = '@oxc-parser/binding-wasm32-wasip1'
const DEFAULT_BINDING_PACKAGE =
  process.env.WASM_BINDING_PACKAGE ?? DEFAULT_BINDING_PACKAGE_NAME
const DEFAULT_BINDING_SOURCE = process.env.WASM_BINDING_PACKAGE ? 'env' : 'default'
const SUPPORTED_PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const
// Node emits a noisy ExperimentalWarning whenever the WASI shim loads; silence just that message.
const WASI_WARNING_SNIPPET = 'WASI is an experimental feature'
const LOADER_CONFIG_EXAMPLE = [
  '// Example loader entry to drop into your bundler rules array:',
  '{',
  "  loader: '@knighted/jsx/loader',",
  '  options: {',
  "    tags: ['jsx', 'reactJsx'],",
  '    tagModes: {',
  "      reactJsx: 'react',",
  '    },',
  '  },',
  '}',
].join('\n')

suppressExperimentalWasiWarning()

type PackageManager = (typeof SUPPORTED_PACKAGE_MANAGERS)[number]

type CliOptions = {
  cwd: string
  dryRun: boolean
  verbose: boolean
  force: boolean
  skipConfig: boolean
  packageManager?: PackageManager
  wasmPackage: string
  wasmVersion?: string
  wasmPackageSource: 'default' | 'env' | 'flag'
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    cwd: process.cwd(),
    dryRun: false,
    verbose: false,
    force: false,
    skipConfig: true,
    wasmPackage: DEFAULT_BINDING_PACKAGE,
    wasmVersion: undefined,
    wasmPackageSource: DEFAULT_BINDING_SOURCE,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--verbose') {
      options.verbose = true
    } else if (arg === '--force' || arg === '--yes') {
      options.force = true
    } else if (arg === '--skip-config') {
      options.skipConfig = true
    } else if (arg === '--config') {
      options.skipConfig = false
    } else if (arg === '--package-manager' || arg === '--pm') {
      const pm = argv[i + 1]
      if (!pm) throw new Error('Missing value for --package-manager')
      if (!SUPPORTED_PACKAGE_MANAGERS.includes(pm as PackageManager)) {
        throw new Error(`Unsupported package manager: ${pm}`)
      }
      options.packageManager = pm as PackageManager
      i += 1
    } else if (arg === '--wasm-package') {
      const pkg = argv[i + 1]
      if (!pkg) throw new Error('Missing value for --wasm-package')
      options.wasmPackage = pkg
      options.wasmPackageSource = 'flag'
      i += 1
    } else if (arg === '--wasm-version') {
      const version = argv[i + 1]
      if (!version) throw new Error('Missing value for --wasm-version')
      options.wasmVersion = version
      i += 1
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return options
}

function printHelp() {
  console.log(
    `\nUsage: npx @knighted/jsx init [options]\n\nOptions:\n  --package-manager, --pm <name>  Choose npm | pnpm | yarn | bun\n  --wasm-package <spec>           Override binding package spec\n  --wasm-version <version>        Pin version for the default binding\n  --config                        Prompt to help with loader config\n  --skip-config                   Skip any loader config prompts (default)\n  --dry-run                       Print actions without executing\n  --force, --yes                  Assume yes for prompts\n  --verbose                       Log extra detail\n  -h, --help                      Show this help message\n`,
  )
}

function log(message: string) {
  console.log(message)
}

function logVerbose(message: string, verbose: boolean) {
  if (verbose) console.log(message)
}

function detectPackageManager(cwd: string, explicit?: PackageManager): PackageManager {
  if (explicit) return explicit

  const ua = process.env.npm_config_user_agent ?? ''
  if (ua.startsWith('pnpm')) return 'pnpm'
  if (ua.startsWith('yarn')) return 'yarn'
  if (ua.startsWith('bun')) return 'bun'

  const lookups: Record<PackageManager, string> = {
    pnpm: 'pnpm-lock.yaml',
    yarn: 'yarn.lock',
    bun: 'bun.lockb',
    npm: 'package-lock.json',
  }

  for (const [pm, lockfile] of Object.entries(lookups) as Array<
    [PackageManager, string]
  >) {
    if (fs.existsSync(path.join(cwd, lockfile))) return pm
  }

  return 'npm'
}

function ensurePackageJson(cwd: string) {
  const pkgPath = path.join(cwd, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error('No package.json found. Run this inside a project with package.json.')
  }
}

function parsePackageName(spec: string) {
  const match = spec.match(/^(@?[^@\s]+\/[^@\s]+|@?[^@\s]+)(?:@(.+))?$/)
  if (!match) return { name: spec, version: undefined }
  const [, name, version] = match
  return { name, version }
}

type NodeRequireFn = ReturnType<typeof createRequire>

function readLocalOxcParserVersion(resolver: NodeRequireFn = CLI_REQUIRE) {
  try {
    // Prefer the version installed alongside this CLI package, not a hoisted sibling.
    const jsxPkgPath = resolver.resolve('@knighted/jsx/package.json')
    const jsxRoot = path.dirname(jsxPkgPath)
    const localParserPkg = path.join(
      jsxRoot,
      'node_modules',
      'oxc-parser',
      'package.json',
    )
    if (fs.existsSync(localParserPkg)) {
      const pkgJson = JSON.parse(fs.readFileSync(localParserPkg, 'utf8')) as {
        version?: string
      }
      if (pkgJson && typeof pkgJson.version === 'string') {
        return pkgJson.version
      }
    }
  } catch {
    // Ignore resolution failures and fall back below.
  }

  try {
    const pkg = resolver('oxc-parser/package.json') as { version?: string }
    if (pkg && typeof pkg.version === 'string') {
      return pkg.version
    }
  } catch {
    // Ignore resolution failures and fall back to registry lookup later.
  }

  return undefined
}

function isRegistryResolvablePackage(name: string) {
  if (!name) return false
  if (name.startsWith('.') || name.startsWith('/')) return false
  if (path.isAbsolute(name)) return false
  const blockedPrefixes = [
    'file:',
    'link:',
    'git+',
    'github:',
    'workspace:',
    'http://',
    'https://',
  ]
  return !blockedPrefixes.some(prefix => name.startsWith(prefix))
}

function fetchLatestBindingVersion(
  pkgName: string,
  execFn: typeof execFileSync = execFileSync,
) {
  const output = execFn('npm', ['view', pkgName, 'version', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()

  if (!output) {
    throw new Error(`Unable to determine latest version for ${pkgName}`)
  }

  const parsed = JSON.parse(output)
  if (typeof parsed === 'string') return parsed
  if (Array.isArray(parsed) && parsed.length > 0) {
    const last = parsed[parsed.length - 1]
    if (typeof last === 'string') return last
  }

  throw new Error(`Unable to determine latest version for ${pkgName}`)
}

function resolveBindingSpec(
  spec: string,
  explicitVersion?: string,
  fetchLatest: typeof fetchLatestBindingVersion = fetchLatestBindingVersion,
) {
  let combinedSpec = spec
  if (explicitVersion) {
    const { name } = parsePackageName(spec)
    if (!name) {
      throw new Error(`Unable to parse binding package spec: ${spec}`)
    }
    combinedSpec = `${name}@${explicitVersion}`
  }

  const { name, version } = parsePackageName(combinedSpec)
  if (!name) {
    throw new Error(`Unable to parse binding package spec: ${spec}`)
  }

  if (version || !isRegistryResolvablePackage(name)) {
    return { spec: combinedSpec, name, version }
  }

  const latest = fetchLatest(name)
  return { spec: `${name}@${latest}`, name, version: latest }
}

async function installBinding(
  spec: string,
  cwd: string,
  dryRun: boolean,
  verbose: boolean,
  pm: PackageManager = 'npm',
  spawner: typeof spawnSync = spawnSync,
): Promise<{ targetDir: string; name: string; version?: string }> {
  const { name, version } = parsePackageName(spec)
  applyWasmRuntimePolicy(cwd, name, version, pm, dryRun)
  const targetDir = path.resolve(cwd, 'node_modules', ...name.split('/'))
  const commands: Record<PackageManager, [string, string[]]> = {
    npm: ['npm', ['install', spec, '--save-exact']],
    pnpm: ['pnpm', ['add', spec, '--exact']],
    yarn: ['yarn', ['add', spec, '--exact']],
    bun: ['bun', ['add', spec, '--exact']],
  }
  const [command, args] = commands[pm]

  log(`> Installing ${spec} with its declared dependencies`)
  logVerbose(`> ${command} ${args.join(' ')}`, verbose)
  if (!dryRun) {
    const npmScript =
      pm === 'npm' && process.platform === 'win32' ? process.env.npm_execpath : undefined
    const executable = npmScript ? process.execPath : command
    const commandArgs = npmScript
      ? [path.join(path.dirname(npmScript), 'npm-cli.js'), ...args]
      : args
    const result = spawner(executable, commandArgs, { cwd, stdio: 'inherit' })
    if (result.status !== 0) {
      throw new Error(`Failed to install WASM binding with ${pm}`)
    }
  }

  return { targetDir, name, version }
}

type BindingImporter = (specifier: string) => Promise<unknown>

async function verifyBinding(
  name: string,
  cwd: string,
  verbose: boolean,
  importer: BindingImporter = specifier => import(specifier),
): Promise<string> {
  const requireFromCwd = createRequire(path.join(cwd, 'package.json'))
  const resolved = requireFromCwd.resolve(name)
  logVerbose(`> Resolved ${name} to ${resolved}`, verbose)

  const imported = await importer(pathToFileURL(resolved).href)
  if (!imported) {
    throw new Error(`Imported ${name} is empty; verification failed`)
  }

  return resolved
}

async function promptYesNo(prompt: string, defaultValue: boolean, force: boolean) {
  if (!process.stdin.isTTY) return defaultValue
  if (force) return true

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const suffix = defaultValue ? '[Y/n]' : '[y/N]'
  const answer = await rl.question(`${prompt} ${suffix} `)
  await rl.close()

  if (!answer.trim()) return defaultValue
  const normalized = answer.trim().toLowerCase()
  return normalized === 'y' || normalized === 'yes'
}

async function maybeHandleConfigPrompt(skipConfig: boolean, force: boolean) {
  if (skipConfig) {
    log('> Skipping loader config (default). Re-run with --config to opt in.')
    return
  }

  const wantsHelp = await promptYesNo(
    'Do you want help adding loader configuration now?',
    false,
    force,
  )

  if (!wantsHelp) {
    log('> Skipping loader config per your choice.')
    return
  }

  log(
    '> Loader assistance is interactive and not applied automatically yet. See docs at docs/cli.md for next steps.',
  )
  log('> Example loader config (webpack / rspack):')
  console.log(LOADER_CONFIG_EXAMPLE)
}

type MainDeps = {
  parseArgs: typeof parseArgs
  ensurePackageJson: typeof ensurePackageJson
  detectPackageManager: typeof detectPackageManager
  installBinding: typeof installBinding
  verifyBinding: typeof verifyBinding
  maybeHandleConfigPrompt: typeof maybeHandleConfigPrompt
  resolveBindingSpec: typeof resolveBindingSpec
  readLocalOxcParserVersion: typeof readLocalOxcParserVersion
  log: typeof log
}

async function main(overrides: Partial<MainDeps> = {}) {
  const {
    parseArgs: parseArgsImpl = parseArgs,
    ensurePackageJson: ensurePackageJsonImpl = ensurePackageJson,
    detectPackageManager: detectPackageManagerImpl = detectPackageManager,
    installBinding: installBindingImpl = installBinding,
    verifyBinding: verifyBindingImpl = verifyBinding,
    maybeHandleConfigPrompt: maybeHandleConfigPromptImpl = maybeHandleConfigPrompt,
    resolveBindingSpec: resolveBindingSpecImpl = resolveBindingSpec,
    readLocalOxcParserVersion: readLocalOxcParserVersionImpl = readLocalOxcParserVersion,
    log: logImpl = log,
  } = overrides

  const options = parseArgsImpl(process.argv.slice(2))
  ensurePackageJsonImpl(options.cwd)

  const bundledParserVersion = readLocalOxcParserVersionImpl()
  const desiredBindingVersion =
    options.wasmVersion ??
    (options.wasmPackageSource === 'default' ? bundledParserVersion : undefined)

  const resolvedBinding = resolveBindingSpecImpl(
    options.wasmPackage,
    desiredBindingVersion,
  )

  const packageManager = detectPackageManagerImpl(options.cwd, options.packageManager)
  logImpl(`> Using package manager: ${packageManager}`)

  const binding = await installBindingImpl(
    resolvedBinding.spec,
    options.cwd,
    options.dryRun,
    options.verbose,
    packageManager,
  )

  let resolvedPath: string | undefined
  if (!options.dryRun) {
    resolvedPath = await verifyBindingImpl(binding.name, options.cwd, options.verbose)
    logImpl(`> Verified ${binding.name} at ${resolvedPath}`)
  }

  await maybeHandleConfigPromptImpl(options.skipConfig, options.force)

  logImpl('\nDone!')
  logImpl(`- Binding: ${binding.name}${binding.version ? `@${binding.version}` : ''}`)
  logImpl(`- Target: ${binding.targetDir}`)
  logImpl('- Runtime dependencies managed by the binding package')
  if (resolvedPath) logImpl(`- Verified import: ${resolvedPath}`)
}

if (process.env.KNIGHTED_JSX_CLI_TEST !== '1') {
  main().catch(error => {
    console.error(
      'Failed to set up WASM binding:',
      error instanceof Error ? error.message : error,
    )
    process.exitCode = 1
  })
}

export {
  parseArgs,
  detectPackageManager,
  ensurePackageJson,
  parsePackageName,
  resolveBindingSpec,
  fetchLatestBindingVersion,
  readLocalOxcParserVersion,
  installBinding,
  verifyBinding,
  promptYesNo,
  maybeHandleConfigPrompt,
  main,
}

function suppressExperimentalWasiWarning() {
  const originalEmitWarning = process.emitWarning.bind(process)
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const [typeMaybe] = args
    const message = typeof warning === 'string' ? warning : warning.message
    const name = typeof warning === 'string' ? undefined : warning.name
    const type = typeof typeMaybe === 'string' ? typeMaybe : undefined

    if (
      message.includes(WASI_WARNING_SNIPPET) &&
      (name === 'ExperimentalWarning' || type === 'ExperimentalWarning')
    ) {
      return
    }

    return (originalEmitWarning as (...args: unknown[]) => void)(warning, ...args)
  }) as typeof process.emitWarning
}
