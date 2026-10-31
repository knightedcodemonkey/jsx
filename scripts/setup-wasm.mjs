import { execFileSync } from 'node:child_process'
import { applyWasmRuntimePolicy } from '../src/cli/wasm-runtime-policy.ts'

const npmExecPath = process.env.npm_execpath
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const packageSpecs = process.env.WASM_BINDING_PACKAGE
  ? [process.env.WASM_BINDING_PACKAGE]
  : [
      '@oxc-parser/binding-wasm32-wasip1@0.156.0',
      '@oxc-transform/binding-wasm32-wasip1@0.156.0',
    ]

function main() {
  try {
    for (const spec of packageSpecs) {
      const separator = spec.lastIndexOf('@')
      const name = separator > 0 ? spec.slice(0, separator) : spec
      const version = separator > 0 ? spec.slice(separator + 1) : undefined
      applyWasmRuntimePolicy(process.cwd(), name, version, 'npm', false)
    }
    const args = [
      'install',
      ...packageSpecs,
      '--no-save',
      '--ignore-scripts',
      '--include=optional',
    ]
    const options = { cwd: process.cwd(), stdio: 'inherit' }
    if (npmExecPath) {
      execFileSync(process.execPath, [npmExecPath, ...args], options)
    } else {
      execFileSync(npmBin, args, { ...options, shell: process.platform === 'win32' })
    }

    console.log(
      `Installed ${packageSpecs.join(', ')} with their compatible dependency graphs`,
    )
  } catch (error) {
    console.error('Failed to install WASM binding:', error)
    process.exit(1)
  }
}

main()
