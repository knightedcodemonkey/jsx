import { execFileSync } from 'node:child_process'

const npmExecPath = process.env.npm_execpath
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const PACKAGE_SPEC =
  process.env.WASM_BINDING_PACKAGE ?? '@oxc-parser/binding-wasm32-wasip1@0.156.0'

function main() {
  try {
    const args = [
      'install',
      PACKAGE_SPEC,
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

    console.log(`Installed ${PACKAGE_SPEC} with its declared dependencies`)
  } catch (error) {
    console.error('Failed to install WASM binding:', error)
    process.exit(1)
  }
}

main()
