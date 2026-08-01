import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const packageJsonPath = path.join(rootDir, 'package.json')
const contractPath = path.join(rootDir, 'cdn-contract.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const normalizeVersion = value => String(value ?? '').replace(/^[~^]/, '')

const toContract = pkg => {
  const parserVersion = normalizeVersion(pkg.dependencies?.['oxc-parser'])
  const transformVersion = normalizeVersion(pkg.dependencies?.['oxc-transform'])
  const parserBindingVersion = normalizeVersion(
    pkg.optionalDependencies?.['@oxc-parser/binding-wasm32-wasi'],
  )
  const wasmRuntimeVersion = normalizeVersion(pkg.dependencies?.['@napi-rs/wasm-runtime'])

  return {
    contractVersion: 1,
    packageName: pkg.name,
    packageVersion: pkg.version,
    defaultProvider: 'esm',
    entries: {
      core: {
        subpath: '.',
        deps: {
          'oxc-parser': parserVersion,
          '@oxc-parser/binding-wasm32-wasi': parserBindingVersion,
          '@napi-rs/wasm-runtime': wasmRuntimeVersion,
        },
      },
      react: {
        subpath: './react',
        deps: {
          'oxc-parser': parserVersion,
          '@oxc-parser/binding-wasm32-wasi': parserBindingVersion,
          '@napi-rs/wasm-runtime': wasmRuntimeVersion,
        },
      },
      transform: {
        subpath: './transform',
        deps: {
          'oxc-parser': parserVersion,
          'oxc-transform': transformVersion,
          '@oxc-parser/binding-wasm32-wasi': parserBindingVersion,
          '@oxc-transform/binding-wasm32-wasi': transformVersion,
          '@napi-rs/wasm-runtime': wasmRuntimeVersion,
        },
      },
    },
  }
}

const hasMissingVersion = contract => {
  const versions = [
    contract.packageVersion,
    contract.entries.core.deps['oxc-parser'],
    contract.entries.core.deps['@oxc-parser/binding-wasm32-wasi'],
    contract.entries.core.deps['@napi-rs/wasm-runtime'],
    contract.entries.transform.deps['oxc-transform'],
    contract.entries.transform.deps['@oxc-transform/binding-wasm32-wasi'],
  ]

  return versions.some(value => typeof value !== 'string' || value.length === 0)
}

const contract = toContract(packageJson)

if (hasMissingVersion(contract)) {
  console.error(
    '[cdn-contract] Failed to generate contract: missing dependency version(s).',
  )
  process.exit(1)
}

const serialized = `${JSON.stringify(contract, null, 2)}\n`
const checkMode = process.argv.includes('--check')

if (checkMode) {
  if (!fs.existsSync(contractPath)) {
    console.error(
      '[cdn-contract] Missing cdn-contract.json. Run npm run generate:cdn-contract.',
    )
    process.exit(1)
  }

  const existing = fs.readFileSync(contractPath, 'utf8')

  if (existing !== serialized) {
    console.error(
      '[cdn-contract] cdn-contract.json is out of date. Run npm run generate:cdn-contract.',
    )
    process.exit(1)
  }

  console.log('[cdn-contract] validation passed')
  process.exit(0)
}

fs.writeFileSync(contractPath, serialized)
console.log('[cdn-contract] wrote cdn-contract.json')
