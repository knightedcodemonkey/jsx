import fs from 'node:fs'
import path from 'node:path'
import crossSpawn from 'cross-spawn'
import { withWasmRuntimePolicies } from '../src/cli/wasm-runtime-policy.ts'

const npmExecPath = process.env.npm_execpath
const packageSpecs = process.env.WASM_BINDING_PACKAGE
  ? [process.env.WASM_BINDING_PACKAGE]
  : [
      '@oxc-parser/binding-wasm32-wasip1@0.156.0',
      '@oxc-transform/binding-wasm32-wasip1@0.156.0',
    ]

function main() {
  try {
    const bindings = packageSpecs.map(spec => {
      const separator = spec.lastIndexOf('@')
      const name = separator > 0 ? spec.slice(0, separator) : spec
      const version = separator > 0 ? spec.slice(separator + 1) : undefined
      return { name, version }
    })
    const args = [
      'install',
      ...packageSpecs,
      '--no-save',
      '--ignore-scripts',
      '--include=optional',
    ]
    const options = { cwd: process.cwd(), stdio: 'inherit' }
    const verifiedNpmScript =
      npmExecPath &&
      path.basename(npmExecPath).toLowerCase() === 'npm-cli.js' &&
      fs.existsSync(npmExecPath)
        ? npmExecPath
        : undefined
    withWasmRuntimePolicies(process.cwd(), bindings, 'npm', false, () => {
      const result = verifiedNpmScript
        ? crossSpawn.sync(process.execPath, [verifiedNpmScript, ...args], options)
        : crossSpawn.sync('npm', args, options)
      if (result.error) throw result.error
      if (result.status !== 0) throw new Error('npm failed to install WASM bindings')
    })

    console.log(
      `Installed ${packageSpecs.join(', ')} with their compatible dependency graphs`,
    )
  } catch (error) {
    console.error('Failed to install WASM binding:', error)
    process.exit(1)
  }
}

main()
