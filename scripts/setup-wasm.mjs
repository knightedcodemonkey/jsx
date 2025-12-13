import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { extract } from 'tar'

const PACKAGE_SPEC =
  process.env.WASM_BINDING_PACKAGE ?? '@oxc-parser/binding-wasm32-wasi@^0.99.0'
const cwd = process.cwd()
const cliEntry = path.resolve(cwd, 'dist', 'cli', 'init.js')

if (fs.existsSync(cliEntry)) {
  const result = spawnSync(process.execPath, [cliEntry, '--skip-config', '--force'], {
    cwd,
    stdio: 'inherit',
  })

  process.exit(result.status ?? 0)
}

function runNpmPack() {
  const output = execFileSync('npm', ['pack', PACKAGE_SPEC], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
  const lines = output.split('\n').filter(Boolean)

  return lines[lines.length - 1]
}

async function main() {
  try {
    const tarballName = runNpmPack()
    const tarballPath = path.resolve(cwd, tarballName)
    const targetDir = path.resolve(
      cwd,
      'node_modules',
      '@oxc-parser',
      'binding-wasm32-wasi',
    )

    fs.rmSync(targetDir, { recursive: true, force: true })
    fs.mkdirSync(targetDir, { recursive: true })

    await extract({ file: tarballPath, cwd: targetDir, strip: 1 })
    fs.rmSync(tarballPath, { force: true })

    console.log(`Installed ${PACKAGE_SPEC} into ${targetDir}`)
  } catch (error) {
    console.error('Failed to install WASM binding:', error)
    process.exit(1)
  }
}

await main()
