import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { extract } from 'tar'

const npmExecPath = process.env.npm_execpath
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const PACKAGE_SPEC =
  process.env.WASM_BINDING_PACKAGE ?? '@oxc-parser/binding-wasm32-wasi@^0.105.0'
const cwd = process.cwd()

function runNpmPack() {
  const baseOptions = {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }
  const output = (
    npmExecPath
      ? execFileSync(process.execPath, [npmExecPath, 'pack', PACKAGE_SPEC], baseOptions)
      : execFileSync(npmBin, ['pack', PACKAGE_SPEC], {
          ...baseOptions,
          shell: process.platform === 'win32',
        })
  ).trim()
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
