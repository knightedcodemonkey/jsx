import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { extract } from 'tar'

const DEFAULT_BINDING_SPEC =
  process.env.WASM_BINDING_PACKAGE ?? '@oxc-parser/binding-wasm32-wasi@^0.99.0'
const RUNTIME_DEPS = ['@napi-rs/wasm-runtime', '@emnapi/runtime', '@emnapi/core']
const SUPPORTED_PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const

type PackageManager = (typeof SUPPORTED_PACKAGE_MANAGERS)[number]

type CliOptions = {
  cwd: string
  dryRun: boolean
  verbose: boolean
  force: boolean
  skipConfig: boolean
  packageManager?: PackageManager
  wasmPackage: string
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    cwd: process.cwd(),
    dryRun: false,
    verbose: false,
    force: false,
    skipConfig: true,
    wasmPackage: DEFAULT_BINDING_SPEC,
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
    `\nUsage: npx @knighted/jsx init [options]\n\nOptions:\n  --package-manager, --pm <name>  Choose npm | pnpm | yarn | bun\n  --wasm-package <spec>           Override binding package spec\n  --config                        Prompt to help with loader config\n  --skip-config                   Skip any loader config prompts (default)\n  --dry-run                       Print actions without executing\n  --force, --yes                  Assume yes for prompts\n  --verbose                       Log extra detail\n  -h, --help                      Show this help message\n`,
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

function runNpmPack(spec: string, cwd: string, dryRun: boolean, verbose: boolean) {
  logVerbose(`> npm pack ${spec}`, verbose)
  if (dryRun) return `${spec.replace(/\W+/g, '_')}.tgz`

  const output = execFileSync('npm', ['pack', spec], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()

  const lines = output.split('\n').filter(Boolean)
  return lines[lines.length - 1]
}

function parsePackageName(spec: string) {
  const match = spec.match(/^(@?[^@\s]+\/[^@\s]+|@?[^@\s]+)(?:@(.+))?$/)
  if (!match) return { name: spec, version: undefined }
  const [, name, version] = match
  return { name, version }
}

async function installBinding(
  spec: string,
  cwd: string,
  dryRun: boolean,
  verbose: boolean,
): Promise<{ targetDir: string; tarballPath?: string; name: string; version?: string }> {
  const { name, version } = parsePackageName(spec)
  const tarballName = runNpmPack(spec, cwd, dryRun, verbose)
  const tarballPath = path.resolve(cwd, tarballName)
  const targetDir = path.resolve(cwd, 'node_modules', ...name.split('/'))

  log(`> Installing ${spec} into ${targetDir}`)
  if (!dryRun) {
    fs.rmSync(targetDir, { recursive: true, force: true })
    fs.mkdirSync(targetDir, { recursive: true })
    await extract({ file: tarballPath, cwd: targetDir, strip: 1 })
    fs.rmSync(tarballPath, { force: true })
  }

  return { targetDir, tarballPath: dryRun ? undefined : tarballPath, name, version }
}

function installRuntimeDeps(
  pm: PackageManager,
  deps: string[],
  cwd: string,
  dryRun: boolean,
  verbose: boolean,
) {
  const missing = deps.filter(dep => !isDependencyInstalled(dep, cwd))
  if (missing.length === 0) {
    log('> Runtime dependencies already present; skipping install')
    return []
  }

  const commands: Record<PackageManager, [string, string[]]> = {
    npm: ['npm', ['install', ...missing, '--save']],
    pnpm: ['pnpm', ['add', ...missing]],
    yarn: ['yarn', ['add', ...missing]],
    bun: ['bun', ['add', ...missing]],
  }

  const [command, args] = commands[pm]
  logVerbose(`> ${command} ${args.join(' ')}`, verbose)
  if (!dryRun) {
    const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
    if (result.status !== 0) {
      throw new Error(`Failed to install runtime dependencies with ${pm}`)
    }
  }

  return missing
}

function isDependencyInstalled(dep: string, cwd: string) {
  try {
    const requireFromCwd = createRequire(path.join(cwd, 'package.json'))
    requireFromCwd.resolve(dep)
    return true
  } catch {
    return false
  }
}

function persistBindingSpec(
  cwd: string,
  name: string,
  version: string | undefined,
  dryRun: boolean,
  verbose: boolean,
) {
  if (!version) {
    logVerbose('> Skipping package.json update (no version parsed)', verbose)
    return
  }

  const pkgPath = path.join(cwd, 'package.json')
  const pkgRaw = fs.readFileSync(pkgPath, 'utf8')
  const pkgJson = JSON.parse(pkgRaw)
  pkgJson.optionalDependencies = pkgJson.optionalDependencies ?? {}
  pkgJson.optionalDependencies[name] = version

  log(`> Recording optionalDependency ${name}@${version}`)
  if (!dryRun) {
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkgJson, null, 2)}\n`, 'utf8')
  }
}

async function verifyBinding(
  name: string,
  cwd: string,
  verbose: boolean,
): Promise<string> {
  const requireFromCwd = createRequire(path.join(cwd, 'package.json'))
  const resolved = requireFromCwd.resolve(name)
  logVerbose(`> Resolved ${name} to ${resolved}`, verbose)

  const imported = await import(pathToFileURL(resolved).href)
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
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  ensurePackageJson(options.cwd)

  const packageManager = detectPackageManager(options.cwd, options.packageManager)
  log(`> Using package manager: ${packageManager}`)

  const installedRuntimeDeps = installRuntimeDeps(
    packageManager,
    RUNTIME_DEPS,
    options.cwd,
    options.dryRun,
    options.verbose,
  )

  const binding = await installBinding(
    options.wasmPackage,
    options.cwd,
    options.dryRun,
    options.verbose,
  )

  persistBindingSpec(
    options.cwd,
    binding.name,
    binding.version,
    options.dryRun,
    options.verbose,
  )

  let resolvedPath: string | undefined
  if (!options.dryRun) {
    resolvedPath = await verifyBinding(binding.name, options.cwd, options.verbose)
    log(`> Verified ${binding.name} at ${resolvedPath}`)
  }

  await maybeHandleConfigPrompt(options.skipConfig, options.force)

  log('\nDone!')
  log(`- Binding: ${binding.name}${binding.version ? `@${binding.version}` : ''}`)
  log(`- Target: ${binding.targetDir}`)
  log(
    `- Runtime deps installed: ${installedRuntimeDeps.join(', ') || 'none (already present)'}`,
  )
  if (resolvedPath) log(`- Verified import: ${resolvedPath}`)
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
  runNpmPack,
  parsePackageName,
  installBinding,
  installRuntimeDeps,
  isDependencyInstalled,
  persistBindingSpec,
  verifyBinding,
  promptYesNo,
  maybeHandleConfigPrompt,
  main,
}
