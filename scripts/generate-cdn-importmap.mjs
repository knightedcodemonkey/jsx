import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Generator } from '@jspm/generator'

import { getWasmRuntimeOverride } from '../src/cli/wasm-runtime-policy.ts'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDir, '..')
const packageJsonPath = path.join(packageRoot, 'package.json')
const packageLockPath = path.join(packageRoot, 'package-lock.json')
const manifestPath = path.join(packageRoot, 'dist', 'cdn-importmap.json')
const lockPath = path.join(packageRoot, 'cdn-importmap-lock.json')
const provider = 'jspm.io'
const providerRoot = 'https://ga.jspm.io/'
const generatorBaseUrl = 'https://example.invalid/'
const generatorMapUrl = `${generatorBaseUrl}importmap.json`
const reactVersion = '19.3.1'
const reactDomVersion = '19.3.1'
const schemaVersion = 1
const lockSchemaVersion = 2
const selfVersionToken = '__SELF_VERSION__'
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/
const bindingNames = [
  '@oxc-parser/binding-wasm32-wasip1',
  '@oxc-transform/binding-wasm32-wasip1',
]

const readJson = async filePath => JSON.parse(await fs.readFile(filePath, 'utf8'))

const exactVersion = (value, label) => {
  if (typeof value !== 'string' || !versionPattern.test(value)) {
    throw new Error(
      `[cdn-importmap] ${label} must be an exact version; received ${value}`,
    )
  }

  return value
}

const getLockedVersion = (packageLock, name) => {
  const entry = packageLock.packages?.[`node_modules/${name}`]
  return exactVersion(entry?.version, `package-lock version for ${name}`)
}

const getInputs = (packageJson, packageLock) => {
  const packageVersion = exactVersion(packageJson.version, 'package version')
  const parserBindingVersion = exactVersion(
    packageJson.optionalDependencies?.[bindingNames[0]],
    bindingNames[0],
  )
  const transformBindingVersion = exactVersion(
    packageJson.optionalDependencies?.[bindingNames[1]],
    bindingNames[1],
  )
  const parserPolicy = getWasmRuntimeOverride(bindingNames[0], parserBindingVersion)?.[
    '@napi-rs/wasm-runtime'
  ]
  const transformPolicy = getWasmRuntimeOverride(
    bindingNames[1],
    transformBindingVersion,
  )?.['@napi-rs/wasm-runtime']

  assert.deepStrictEqual(
    parserPolicy,
    transformPolicy,
    '[cdn-importmap] Parser and transformer runtime policies must match',
  )

  if (!parserPolicy) {
    throw new Error('[cdn-importmap] No compatible OXC WASM runtime policy is defined')
  }

  const resolutions = {
    '@emnapi/core': parserPolicy['@emnapi/core'],
    '@emnapi/runtime': parserPolicy['@emnapi/runtime'],
    '@napi-rs/wasm-runtime': parserPolicy['.'],
    '@oxc-parser/binding-wasm32-wasip1': parserBindingVersion,
    '@oxc-transform/binding-wasm32-wasip1': transformBindingVersion,
    'magic-string': getLockedVersion(packageLock, 'magic-string'),
    'oxc-parser': getLockedVersion(packageLock, 'oxc-parser'),
    'oxc-transform': getLockedVersion(packageLock, 'oxc-transform'),
    'property-information': getLockedVersion(packageLock, 'property-information'),
    react: reactVersion,
    'react-dom': reactDomVersion,
  }

  for (const [name, version] of Object.entries(resolutions)) {
    exactVersion(version, `resolution for ${name}`)
  }

  return {
    packageName: packageJson.name,
    packageVersion,
    resolutions,
  }
}

const sortJson = value => {
  if (Array.isArray(value)) {
    return value.map(sortJson)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sortJson(value[key])]),
    )
  }

  return value
}

export const serializeArtifact = value => `${JSON.stringify(sortJson(value), null, 2)}\n`

const packageUrl = (name, version) => `${providerRoot}npm:${name}@${version}/`

const replaceSelfVersion = (value, packageName, sourceVersion, targetVersion) => {
  const sourceUrl = packageUrl(packageName, sourceVersion)
  const targetUrl = packageUrl(packageName, targetVersion)

  if (typeof value === 'string') {
    return value.replaceAll(sourceUrl, targetUrl)
  }
  if (Array.isArray(value)) {
    return value.map(entry =>
      replaceSelfVersion(entry, packageName, sourceVersion, targetVersion),
    )
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key.replaceAll(sourceUrl, targetUrl),
        replaceSelfVersion(entry, packageName, sourceVersion, targetVersion),
      ]),
    )
  }

  return value
}

const collectInstallUrls = lock => {
  const entries = [
    ...Object.values(lock.primary ?? {}),
    ...Object.values(lock.secondary ?? {}).flatMap(Object.values),
    ...Object.values(lock.flattened ?? {}),
  ]

  return entries.map(entry => entry.installUrl).filter(value => typeof value === 'string')
}

const collectFiles = async (directory, prefix = '') => {
  const files = {}
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    const relativePath = path.posix.join(prefix, entry.name)
    if (entry.isDirectory()) {
      Object.assign(files, await collectFiles(absolutePath, relativePath))
    } else {
      files[relativePath] = await fs.readFile(absolutePath)
    }
  }
  return files
}

const registerCandidatePackage = async (generator, inputs) => {
  const distPath = path.join(packageRoot, 'dist')
  const files = await collectFiles(distPath, 'dist')
  if (!files['dist/index.js']) {
    throw new Error('[cdn-importmap] Build the package before generating a candidate map')
  }

  files['package.json'] = JSON.stringify(inputs.packageJson)
  generator.setVirtualSourceData(
    packageUrl(inputs.packageName, inputs.packageVersion),
    files,
  )
}

const assertVersionedPackageUrl = (url, label) => {
  if (
    typeof url !== 'string' ||
    !url.startsWith(`${providerRoot}npm:`) ||
    !url.endsWith('/')
  ) {
    throw new Error(
      `[cdn-importmap] ${label} is not a versioned JSPM package URL: ${url}`,
    )
  }

  const packageSpecifier = url.slice(`${providerRoot}npm:`.length, -1)
  const versionSeparator = packageSpecifier.lastIndexOf('@')
  const version = packageSpecifier.slice(versionSeparator + 1)

  if (versionSeparator < 1 || !versionPattern.test(version)) {
    throw new Error(
      `[cdn-importmap] ${label} does not use an exact package version: ${url}`,
    )
  }
}

const getScopeDependency = (scopes, name, version, dependency) => {
  const scopeUrl = packageUrl(name, version)
  const resolved = scopes?.[scopeUrl]?.[dependency]

  if (typeof resolved !== 'string') {
    throw new Error(
      `[cdn-importmap] Missing ${dependency} edge in ${name}@${version} scope`,
    )
  }

  return resolved
}

const getAssets = (scopes, resolutions) => [
  {
    packageName: bindingNames[0],
    packageVersion: resolutions[bindingNames[0]],
    moduleUrl: getScopeDependency(
      scopes,
      'oxc-parser',
      resolutions['oxc-parser'],
      bindingNames[0],
    ),
    url: new URL(
      './parser.wasm32-wasip1.wasm',
      getScopeDependency(
        scopes,
        'oxc-parser',
        resolutions['oxc-parser'],
        bindingNames[0],
      ),
    ).href,
  },
  {
    packageName: bindingNames[1],
    packageVersion: resolutions[bindingNames[1]],
    moduleUrl: getScopeDependency(
      scopes,
      'oxc-transform',
      resolutions['oxc-transform'],
      bindingNames[1],
    ),
    url: new URL(
      './transform.wasm32-wasip1.wasm',
      getScopeDependency(
        scopes,
        'oxc-transform',
        resolutions['oxc-transform'],
        bindingNames[1],
      ),
    ).href,
  },
]

export const validateCdnImportMapArtifacts = ({
  manifest,
  lockfile,
  packageJson,
  packageLock,
}) => {
  const inputs = getInputs(packageJson, packageLock)

  assert.deepStrictEqual(manifest.schemaVersion, schemaVersion)
  assert.deepStrictEqual(lockfile.schemaVersion, lockSchemaVersion)
  assert.deepStrictEqual(manifest.package, {
    name: inputs.packageName,
    version: inputs.packageVersion,
  })
  assert.deepStrictEqual(lockfile.package, {
    name: inputs.packageName,
    version: selfVersionToken,
  })
  assert.deepStrictEqual(manifest.provider, provider)
  assert.deepStrictEqual(lockfile.provider, provider)
  assert.deepStrictEqual(manifest.resolutions, inputs.resolutions)
  assert.deepStrictEqual(lockfile.resolutions, inputs.resolutions)
  const mapTemplate = replaceSelfVersion(
    lockfile.mapTemplate,
    inputs.packageName,
    selfVersionToken,
    inputs.packageVersion,
  )
  assert.deepStrictEqual(mapTemplate, {
    imports: manifest.imports,
    scopes: manifest.scopes,
  })
  assert.deepStrictEqual(manifest.entries, {
    core: '@knighted/jsx',
    react: '@knighted/jsx/react',
    transform: '@knighted/jsx/transform',
    reactDomClient: 'react-dom/client',
  })

  const expectedImports = {
    '@knighted/jsx': `${packageUrl(inputs.packageName, inputs.packageVersion)}dist/index.js`,
    '@knighted/jsx/react': `${packageUrl(inputs.packageName, inputs.packageVersion)}dist/react/index.js`,
    '@knighted/jsx/transform': `${packageUrl(inputs.packageName, inputs.packageVersion)}dist/transform.js`,
    react: `${packageUrl('react', reactVersion)}index.js`,
    'react-dom': `${packageUrl('react-dom', reactDomVersion)}index.js`,
    'react-dom/client': `${packageUrl('react-dom', reactDomVersion)}client.js`,
  }

  assert.deepStrictEqual(manifest.imports, expectedImports)

  const lock = replaceSelfVersion(
    lockfile.lock,
    inputs.packageName,
    selfVersionToken,
    inputs.packageVersion,
  )
  if (!lock || typeof lock !== 'object') {
    throw new Error('[cdn-importmap] Missing JSPM lock data')
  }

  const installUrls = collectInstallUrls(lock)
  if (!installUrls.length) {
    throw new Error('[cdn-importmap] JSPM lock contains no package resolutions')
  }

  for (const [index, url] of installUrls.entries()) {
    assertVersionedPackageUrl(url, `lock resolution ${index}`)
  }

  for (const [specifier, url] of Object.entries(manifest.imports)) {
    if (!installUrls.some(baseUrl => url.startsWith(baseUrl))) {
      throw new Error(
        `[cdn-importmap] Import ${specifier} is not covered by the JSPM lock`,
      )
    }
  }

  for (const [scope, mappings] of Object.entries(manifest.scopes ?? {})) {
    assertVersionedPackageUrl(scope, 'import map scope')

    for (const [specifier, url] of Object.entries(mappings)) {
      if (!installUrls.some(baseUrl => url.startsWith(baseUrl))) {
        throw new Error(
          `[cdn-importmap] Scoped import ${specifier} in ${scope} is not covered by the JSPM lock`,
        )
      }
    }
  }

  const jsxScope = manifest.scopes[packageUrl(inputs.packageName, inputs.packageVersion)]
  assert.equal(jsxScope?.react, manifest.imports.react)
  assert.equal(
    getScopeDependency(manifest.scopes, 'react-dom', reactDomVersion, 'react'),
    manifest.imports.react,
  )
  getScopeDependency(
    manifest.scopes,
    'magic-string',
    inputs.resolutions['magic-string'],
    '@jridgewell/sourcemap-codec',
  )
  getScopeDependency(
    manifest.scopes,
    '@napi-rs/wasm-runtime',
    inputs.resolutions['@napi-rs/wasm-runtime'],
    '@tybys/wasm-util',
  )
  getScopeDependency(
    manifest.scopes,
    '@emnapi/core',
    inputs.resolutions['@emnapi/core'],
    '@emnapi/wasi-threads',
  )
  getScopeDependency(manifest.scopes, 'react-dom', reactDomVersion, 'scheduler')
  assert.equal(
    getScopeDependency(
      manifest.scopes,
      'oxc-parser',
      inputs.resolutions['oxc-parser'],
      bindingNames[0],
    ),
    `${packageUrl(bindingNames[0], inputs.resolutions[bindingNames[0]])}parser.wasip1-browser.js`,
  )
  assert.equal(
    getScopeDependency(
      manifest.scopes,
      'oxc-transform',
      inputs.resolutions['oxc-transform'],
      bindingNames[1],
    ),
    `${packageUrl(bindingNames[1], inputs.resolutions[bindingNames[1]])}transform.wasip1-browser.js`,
  )

  const parserBindingScope =
    lock.secondary?.[packageUrl(bindingNames[0], inputs.resolutions[bindingNames[0]])]
  const transformBindingScope =
    lock.secondary?.[packageUrl(bindingNames[1], inputs.resolutions[bindingNames[1]])]
  const runtimeScope =
    lock.secondary?.[
      packageUrl('@napi-rs/wasm-runtime', inputs.resolutions['@napi-rs/wasm-runtime'])
    ]

  for (const [name, scope] of [
    [bindingNames[0], parserBindingScope],
    [bindingNames[1], transformBindingScope],
  ]) {
    assert.equal(
      scope?.['@napi-rs/wasm-runtime']?.installUrl,
      packageUrl('@napi-rs/wasm-runtime', inputs.resolutions['@napi-rs/wasm-runtime']),
      `[cdn-importmap] ${name} must use the compatible WASM runtime`,
    )
    assert.equal(
      scope?.['@emnapi/runtime']?.installUrl,
      packageUrl('@emnapi/runtime', inputs.resolutions['@emnapi/runtime']),
      `[cdn-importmap] ${name} must use the compatible emnapi runtime`,
    )
  }

  assert.equal(
    runtimeScope?.['@emnapi/core']?.installUrl,
    packageUrl('@emnapi/core', inputs.resolutions['@emnapi/core']),
  )
  assert.equal(
    runtimeScope?.['@emnapi/runtime']?.installUrl,
    packageUrl('@emnapi/runtime', inputs.resolutions['@emnapi/runtime']),
  )

  assert.deepStrictEqual(manifest.assets, getAssets(manifest.scopes, inputs.resolutions))

  return inputs
}

const createArtifacts = (inputs, map, lock) => {
  const manifest = {
    schemaVersion,
    package: { name: inputs.packageName, version: inputs.packageVersion },
    provider,
    entries: {
      core: '@knighted/jsx',
      react: '@knighted/jsx/react',
      transform: '@knighted/jsx/transform',
      reactDomClient: 'react-dom/client',
    },
    resolutions: inputs.resolutions,
    assets: getAssets(map.scopes, inputs.resolutions),
    imports: map.imports,
    scopes: map.scopes,
  }
  const lockfile = {
    schemaVersion: lockSchemaVersion,
    package: { name: inputs.packageName, version: selfVersionToken },
    provider,
    resolutions: inputs.resolutions,
    mapTemplate: replaceSelfVersion(
      { imports: map.imports, scopes: map.scopes },
      inputs.packageName,
      inputs.packageVersion,
      selfVersionToken,
    ),
    lock: replaceSelfVersion(
      lock,
      inputs.packageName,
      inputs.packageVersion,
      selfVersionToken,
    ),
  }

  validateCdnImportMapArtifacts({
    manifest,
    lockfile,
    packageJson: inputs.packageJson,
    packageLock: inputs.packageLock,
  })

  return { manifest, lockfile }
}

const createGenerator = options =>
  new Generator({
    baseUrl: generatorBaseUrl,
    mapUrl: generatorMapUrl,
    env: ['browser'],
    defaultProvider: provider,
    flattenScopes: false,
    ...options,
  })

const getInstallTargets = ({ packageName, packageVersion }) => [
  `npm:${packageName}@${packageVersion}`,
  `npm:${packageName}@${packageVersion}/react`,
  `npm:${packageName}@${packageVersion}/transform`,
  `npm:react@${reactVersion}`,
  `npm:react-dom@${reactDomVersion}/client`,
]

const readInputs = async () => {
  const [packageJson, packageLock] = await Promise.all([
    readJson(packageJsonPath),
    readJson(packageLockPath),
  ])
  const values = getInputs(packageJson, packageLock)

  return { ...values, packageJson, packageLock }
}

const updateArtifacts = async (inputs, candidate) => {
  const resolver = createGenerator({ resolutions: inputs.resolutions })
  if (candidate) {
    await registerCandidatePackage(resolver, inputs)
  }
  await resolver.install(getInstallTargets(inputs))

  const freezer = createGenerator({
    inputMap: resolver.getMap(),
    lock: resolver.getLock(),
  })
  if (candidate) {
    await registerCandidatePackage(freezer, inputs)
  }
  await freezer.install('freeze')

  return createArtifacts(inputs, freezer.getMap(), freezer.getLock())
}

const checkArtifacts = async (inputs, candidate) => {
  const [lockfile, lockText] = await Promise.all([
    readJson(lockPath),
    fs.readFile(lockPath, 'utf8'),
  ])

  const freezer = createGenerator({
    inputMap: replaceSelfVersion(
      lockfile.mapTemplate,
      inputs.packageName,
      selfVersionToken,
      inputs.packageVersion,
    ),
    lock: replaceSelfVersion(
      lockfile.lock,
      inputs.packageName,
      selfVersionToken,
      inputs.packageVersion,
    ),
  })
  if (candidate) {
    await registerCandidatePackage(freezer, inputs)
  }
  await freezer.install('freeze')

  const expected = createArtifacts(inputs, freezer.getMap(), freezer.getLock())
  if (lockText !== serializeArtifact(expected.lockfile)) {
    throw new Error(
      '[cdn-importmap] cdn-importmap-lock.json is stale or not canonical; run npm run generate:cdn-importmap',
    )
  }

  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, serializeArtifact(expected.manifest))
}

const main = async () => {
  const args = process.argv.slice(2)
  const mode = args.find(arg => arg === '--update' || arg === '--check')
  const candidate = args.includes('--candidate')
  if (!mode || args.some(arg => arg !== mode && arg !== '--candidate')) {
    throw new Error(
      'Usage: node scripts/generate-cdn-importmap.mjs --update|--check [--candidate]',
    )
  }

  const inputs = await readInputs()
  if (mode === '--check') {
    await checkArtifacts(inputs, candidate)
    console.log('[cdn-importmap] validation passed')
    return
  }

  const { manifest, lockfile } = await updateArtifacts(inputs, candidate)
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await Promise.all([
    fs.writeFile(manifestPath, serializeArtifact(manifest)),
    fs.writeFile(lockPath, serializeArtifact(lockfile)),
  ])
  console.log('[cdn-importmap] wrote cdn-importmap.json and cdn-importmap-lock.json')
}

const isDirectExecution = async () => {
  if (!process.argv[1]) {
    return false
  }

  try {
    const [entrypointPath, currentFilePath] = await Promise.all([
      fs.realpath(process.argv[1]),
      fs.realpath(fileURLToPath(import.meta.url)),
    ])
    return entrypointPath === currentFilePath
  } catch {
    return false
  }
}

if (await isDirectExecution()) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
