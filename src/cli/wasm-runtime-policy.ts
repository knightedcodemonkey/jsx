import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const bindingNames = [
  '@oxc-parser/binding-wasm32-wasip1',
  '@oxc-transform/binding-wasm32-wasip1',
]

export function applyWasmRuntimePolicy(
  cwd: string,
  name: string,
  version: string | undefined,
  pm: string,
  dryRun: boolean,
) {
  if (!bindingNames.includes(name)) return
  if (
    !version ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version)
  ) {
    throw new Error(
      `Use a canonical exact version for ${name}, such as 0.156.0; ranges and tags are not supported`,
    )
  }
  if (version !== '0.156.0') return
  if (pm !== 'npm') {
    throw new Error(
      `OXC binding 0.156.0 requires a tested npm-scoped runtime override. ${pm} is not supported for this binding yet; use --pm npm or wait for a compatible upstream release.`,
    )
  }

  let packageDir = path.resolve(cwd)
  let parentDir = path.dirname(packageDir)
  while (parentDir !== packageDir) {
    const parentPkgPath = path.join(parentDir, 'package.json')
    if (fs.existsSync(parentPkgPath)) {
      const parentPkg: unknown = JSON.parse(fs.readFileSync(parentPkgPath, 'utf8'))
      if (
        typeof parentPkg === 'object' &&
        parentPkg !== null &&
        'workspaces' in parentPkg
      ) {
        throw new Error(
          `Run the OXC binding installation from the npm workspace root (${parentDir}); child-project overrides are ignored`,
        )
      }
    }
    packageDir = parentDir
    parentDir = path.dirname(packageDir)
  }

  const pkgPath = path.join(cwd, 'package.json')
  const pkg: unknown = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  if (typeof pkg !== 'object' || pkg === null || Array.isArray(pkg)) {
    throw new Error('Invalid project package.json')
  }
  const overrides = ('overrides' in pkg ? pkg.overrides : undefined) ?? {}
  if (typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new Error('Invalid npm overrides in project package.json')
  }
  const key = `${name}@0.156.0`
  const workaround = {
    '@napi-rs/wasm-runtime': {
      '.': '1.2.5',
      '@emnapi/core': '2.0.0-alpha.6',
      '@emnapi/runtime': '2.0.0-alpha.6',
    },
  }
  for (const selector of Object.keys(overrides)) {
    if (selector !== key && (selector === name || selector.startsWith(`${name}@`))) {
      throw new Error(
        `Conflicting npm override for ${selector}; use only the exact ${key} policy. No overrides were changed`,
      )
    }
  }
  const existing: unknown = Object.entries(overrides).find(
    ([selector]) => selector === key,
  )?.[1]
  if (existing !== undefined && !isDeepStrictEqual(existing, workaround)) {
    throw new Error(`Conflicting npm override for ${key}; no overrides were changed`)
  }
  console.log(`> Applying ${key} scoped runtime compatibility override`)
  if (!dryRun && existing === undefined) {
    fs.writeFileSync(
      pkgPath,
      `${JSON.stringify({ ...pkg, overrides: { ...overrides, [key]: workaround } }, null, 2)}\n`,
      'utf8',
    )
  }
}
