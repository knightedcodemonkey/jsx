export type CdnStableProvider = 'esm' | 'jsdelivr'

export type CdnStableEntryKey = 'core' | 'react' | 'transform'

export type CdnStableEntry = {
  subpath: string
  deps: Record<string, string>
}

export type CdnContract = {
  contractVersion: number
  packageName: string
  packageVersion: string
  defaultProvider: CdnStableProvider
  entries: Record<CdnStableEntryKey, CdnStableEntry>
}

export type BuildStableCdnUrlsOptions = {
  provider?: CdnStableProvider
  target?: string
  contract: CdnContract
}

export type GetStableCdnUrlsOptions = {
  provider?: CdnStableProvider
  target?: string
  contract?: CdnContract
}

export type StableCdnUrls = {
  provider: CdnStableProvider
  target: string
  packageName: string
  packageVersion: string
  urls: Record<CdnStableEntryKey, string>
}

export type StableCdnImportMap = {
  imports: Record<string, string>
  scopes: Record<string, Record<string, string>>
}

type StableCdnImportMapManifest = StableCdnImportMap & {
  schemaVersion: number
  package: { name: string; version: string }
  provider: string
  entries: Record<string, string>
  resolutions: Record<string, string>
  assets: Array<{
    url: string
    moduleUrl: string
    packageName: string
    packageVersion: string
  }>
}

export type StableCdnLoadEntry = CdnStableEntryKey

export type LoadStableCdnOptions = {
  entries?: readonly StableCdnLoadEntry[]
}

export type StableCdnModules = {
  jsx?: typeof import('./index.js').jsx
  reactJsx?: typeof import('./react/index.js').reactJsx
  transformJsxSource?: typeof import('./transform.js').transformJsxSource
}

export type StableCdnCoreModules = StableCdnModules & {
  jsx: NonNullable<StableCdnModules['jsx']>
}

const normalizeProvider = (
  provider: CdnStableProvider | undefined,
): CdnStableProvider => {
  if (!provider || provider === 'esm') {
    return 'esm'
  }

  if (provider === 'jsdelivr') {
    return 'jsdelivr'
  }

  throw new Error(`[cdn-stable] Unsupported provider: ${String(provider)}`)
}

const toDependencyList = (entry: CdnStableEntry) =>
  Object.entries(entry.deps)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, version]) => `${name}@${version}`)
    .join(',')

const toPackageSpecifier = (contract: CdnContract, entry: CdnStableEntry) => {
  const subpath = entry.subpath === '.' ? '' : `/${entry.subpath.replace(/^\.\//, '')}`
  return `${contract.packageName}@${contract.packageVersion}${subpath}`
}

const toEsmShUrl = (
  contract: CdnContract,
  entry: CdnStableEntry,
  target: string,
): string => {
  const params = new URLSearchParams({
    target,
    deps: toDependencyList(entry),
  })

  return `https://esm.sh/${toPackageSpecifier(contract, entry)}?bundle&${params.toString()}`
}

const toJsDelivrUrl = (contract: CdnContract, entry: CdnStableEntry): string => {
  return `https://cdn.jsdelivr.net/npm/${toPackageSpecifier(contract, entry)}/+esm`
}

const assertContract = (contract: CdnContract) => {
  if (!contract || typeof contract !== 'object') {
    throw new Error('[cdn-stable] A valid contract object is required.')
  }

  for (const key of ['core', 'react', 'transform'] as CdnStableEntryKey[]) {
    const entry = contract.entries?.[key]

    if (!entry || typeof entry !== 'object') {
      throw new Error(`[cdn-stable] Missing contract entry: ${key}`)
    }

    if (typeof entry.subpath !== 'string' || entry.subpath.length === 0) {
      throw new Error(`[cdn-stable] Invalid subpath for contract entry: ${key}`)
    }

    if (!entry.deps || typeof entry.deps !== 'object') {
      throw new Error(`[cdn-stable] Missing dependency map for contract entry: ${key}`)
    }
  }
}

export const loadCdnContract = async (): Promise<CdnContract> => {
  const contractUrl = new URL('../cdn-contract.json', import.meta.url)

  if (contractUrl.protocol === 'file:') {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(contractUrl, 'utf8')
    return JSON.parse(content) as CdnContract
  }

  const response = await fetch(contractUrl.href)
  if (!response.ok) {
    throw new Error(
      `[cdn-stable] Unable to load contract from ${contractUrl.href}: ${response.status}`,
    )
  }

  return (await response.json()) as CdnContract
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(entry => typeof entry === 'string')

const assertStableCdnImportMapManifest = (value: unknown): StableCdnImportMapManifest => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.package) ||
    typeof value.package.name !== 'string' ||
    typeof value.package.version !== 'string' ||
    value.provider !== 'jspm.io' ||
    !isStringRecord(value.entries) ||
    !isStringRecord(value.resolutions) ||
    !isStringRecord(value.imports) ||
    !isRecord(value.scopes) ||
    !Array.isArray(value.assets)
  ) {
    throw new Error('[cdn-stable] Invalid stable CDN import map manifest')
  }

  if (
    value.package.name !== '@knighted/jsx' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(
      value.package.version,
    )
  ) {
    throw new Error(
      '[cdn-stable] Invalid package identity in stable CDN import map manifest',
    )
  }

  const packageRoot = `https://ga.jspm.io/npm:${value.package.name}@${value.package.version}/`
  const expectedEntries = {
    core: '@knighted/jsx',
    react: '@knighted/jsx/react',
    transform: '@knighted/jsx/transform',
    reactDomClient: 'react-dom/client',
  }
  for (const [name, specifier] of Object.entries(expectedEntries)) {
    if (value.entries[name] !== specifier) {
      throw new Error(
        `[cdn-stable] Invalid "${name}" entry in stable CDN import map manifest`,
      )
    }
  }

  const reactVersion = value.resolutions.react
  const reactDomVersion = value.resolutions['react-dom']
  if (
    !reactVersion ||
    !reactDomVersion ||
    value.imports['@knighted/jsx'] !== `${packageRoot}dist/index.js` ||
    value.imports['@knighted/jsx/react'] !== `${packageRoot}dist/react/index.js` ||
    value.imports['@knighted/jsx/transform'] !== `${packageRoot}dist/transform.js` ||
    value.imports.react !== `https://ga.jspm.io/npm:react@${reactVersion}/index.js` ||
    value.imports['react-dom/client'] !==
      `https://ga.jspm.io/npm:react-dom@${reactDomVersion}/client.js`
  ) {
    throw new Error(
      '[cdn-stable] Import map entries do not match the manifest package versions',
    )
  }

  const packageScope = value.scopes[packageRoot]
  const reactDomScope =
    value.scopes[`https://ga.jspm.io/npm:react-dom@${reactDomVersion}/`]
  if (
    !isStringRecord(packageScope) ||
    packageScope.react !== value.imports.react ||
    !isStringRecord(reactDomScope) ||
    reactDomScope.react !== value.imports.react
  ) {
    throw new Error('[cdn-stable] React imports do not use one canonical module URL')
  }

  for (const [scope, mappings] of Object.entries(value.scopes)) {
    if (
      !scope.startsWith('https://ga.jspm.io/') ||
      !scope.endsWith('/') ||
      !isStringRecord(mappings)
    ) {
      throw new Error(`[cdn-stable] Invalid import map scope: ${scope}`)
    }
  }

  const urls = [
    ...Object.values(value.imports),
    ...Object.values(value.scopes).flatMap(scope => Object.values(scope as object)),
  ]

  for (const url of urls) {
    if (typeof url !== 'string' || !url.startsWith('https://ga.jspm.io/')) {
      throw new Error(
        `[cdn-stable] Import map contains an unsupported URL: ${String(url)}`,
      )
    }
  }

  for (const entry of value.assets) {
    if (
      !isRecord(entry) ||
      typeof entry.url !== 'string' ||
      !entry.url.startsWith('https://ga.jspm.io/') ||
      typeof entry.moduleUrl !== 'string' ||
      typeof entry.packageName !== 'string' ||
      typeof entry.packageVersion !== 'string'
    ) {
      throw new Error(
        '[cdn-stable] Invalid asset entry in stable CDN import map manifest',
      )
    }
  }

  return value as unknown as StableCdnImportMapManifest
}

const loadStableCdnImportMapManifest = async (): Promise<StableCdnImportMapManifest> => {
  const manifestUrl = new URL('./cdn-importmap.json', import.meta.url)

  if (manifestUrl.protocol === 'file:') {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(manifestUrl, 'utf8')
    return assertStableCdnImportMapManifest(JSON.parse(content))
  }

  let response: Response
  try {
    response = await fetch(manifestUrl.href)
  } catch (error) {
    throw new Error(`[cdn-stable] Failed to fetch import map from ${manifestUrl.href}`, {
      cause: error,
    })
  }
  if (!response.ok) {
    throw new Error(
      `[cdn-stable] Unable to load import map from ${manifestUrl.href}: ${response.status}`,
    )
  }

  return assertStableCdnImportMapManifest(await response.json())
}

export const getStableCdnImportMap = async (): Promise<StableCdnImportMap> => {
  const manifest = await loadStableCdnImportMapManifest()

  return {
    imports: { ...manifest.imports },
    scopes: Object.fromEntries(
      Object.entries(manifest.scopes).map(([scope, mappings]) => [
        scope,
        { ...mappings },
      ]),
    ),
  }
}

type ParsedImportMap = {
  imports: Record<string, string>
  scopes: Record<string, Record<string, string>>
}

const importMapInstallations = new WeakMap<Document, Promise<void>>()

const parseDocumentImportMap = (script: HTMLScriptElement): ParsedImportMap => {
  let value: unknown
  try {
    value = JSON.parse(script.textContent ?? '')
  } catch (error) {
    throw new Error('[cdn-stable] An existing import map contains invalid JSON', {
      cause: error,
    })
  }

  if (!isRecord(value)) {
    throw new Error('[cdn-stable] An existing import map must be an object')
  }

  const imports = value.imports ?? {}
  const scopes = value.scopes ?? {}
  if (!isStringRecord(imports) || !isRecord(scopes)) {
    throw new Error('[cdn-stable] An existing import map has invalid imports or scopes')
  }

  for (const [scope, mappings] of Object.entries(scopes)) {
    if (!isStringRecord(mappings)) {
      throw new Error(`[cdn-stable] An existing import map has invalid scope: ${scope}`)
    }
  }

  return { imports, scopes: scopes as Record<string, Record<string, string>> }
}

const findImportMapTarget = (
  mappings: Record<string, string>,
  specifier: string,
): string | undefined => {
  if (Object.hasOwn(mappings, specifier)) {
    return mappings[specifier]
  }

  const prefix = Object.keys(mappings)
    .filter(key => key.endsWith('/') && specifier.startsWith(key))
    .sort((first, second) => second.length - first.length)[0]

  return prefix ? `${mappings[prefix]}${specifier.slice(prefix.length)}` : undefined
}

const resolveImportMapSpecifier = (
  importMap: ParsedImportMap,
  specifier: string,
  parentUrl: string,
  baseUrl: string,
): string | undefined => {
  const scopes = Object.entries(importMap.scopes)
    .map(([scope, mappings]) => ({ scope: new URL(scope, baseUrl).href, mappings }))
    .filter(({ scope }) => parentUrl.startsWith(scope))
    .sort((first, second) => second.scope.length - first.scope.length)

  for (const { mappings } of scopes) {
    const target = findImportMapTarget(mappings, specifier)
    if (target !== undefined) {
      return new URL(target, baseUrl).href
    }
  }

  const target = findImportMapTarget(importMap.imports, specifier)
  return target === undefined ? undefined : new URL(target, baseUrl).href
}

const assertNoImportMapConflicts = (
  document: Document,
  generated: StableCdnImportMap,
  existingMaps: ParsedImportMap[],
) => {
  const checkMapping = (specifier: string, target: string, parentUrl: string) => {
    const expectedUrl = new URL(target, document.baseURI).href

    for (const existingMap of existingMaps) {
      const existingUrl = resolveImportMapSpecifier(
        existingMap,
        specifier,
        parentUrl,
        document.baseURI,
      )
      if (existingUrl !== undefined && existingUrl !== expectedUrl) {
        throw new Error(
          `[cdn-stable] Import map conflict for "${specifier}": the host maps it to ${existingUrl}, but the stable graph requires ${expectedUrl}`,
        )
      }
    }
  }

  for (const [specifier, target] of Object.entries(generated.imports)) {
    checkMapping(specifier, target, document.baseURI)
  }

  for (const [scope, mappings] of Object.entries(generated.scopes)) {
    const parentUrl = new URL(scope, document.baseURI).href
    for (const [specifier, target] of Object.entries(mappings)) {
      checkMapping(specifier, target, parentUrl)
    }
  }
}

const createMissingImportMap = (
  document: Document,
  generated: StableCdnImportMap,
  existingMaps: ParsedImportMap[],
): StableCdnImportMap => {
  const resolveExisting = (specifier: string, parentUrl: string) =>
    existingMaps
      .map(importMap =>
        resolveImportMapSpecifier(importMap, specifier, parentUrl, document.baseURI),
      )
      .find(target => target !== undefined)

  const imports: Record<string, string> = {}
  for (const [specifier, target] of Object.entries(generated.imports)) {
    if (resolveExisting(specifier, document.baseURI) === undefined) {
      imports[specifier] = target
    }
  }

  const scopes: Record<string, Record<string, string>> = {}
  for (const [scope, mappings] of Object.entries(generated.scopes)) {
    const parentUrl = new URL(scope, document.baseURI).href
    const missing: Record<string, string> = {}
    for (const [specifier, target] of Object.entries(mappings)) {
      if (resolveExisting(specifier, parentUrl) === undefined) {
        missing[specifier] = target
      }
    }
    if (Object.keys(missing).length) {
      scopes[scope] = missing
    }
  }

  return { imports, scopes }
}

const installStableCdnImportMap = async (
  document: Document,
  generated: StableCdnImportMap,
): Promise<void> => {
  const installed = importMapInstallations.get(document)
  if (installed) {
    return installed
  }

  const installation = Promise.resolve().then(() => {
    if (!document.head) {
      throw new Error('[cdn-stable] The document has no head to install its import map')
    }

    const existingMaps = Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[type="importmap"]'),
      parseDocumentImportMap,
    )
    assertNoImportMapConflicts(document, generated, existingMaps)
    const missing = createMissingImportMap(document, generated, existingMaps)
    if (!Object.keys(missing.imports).length && !Object.keys(missing.scopes).length) {
      return
    }

    const script = document.createElement('script')
    script.type = 'importmap'
    script.textContent = JSON.stringify(missing)
    document.head.append(script)
  })

  importMapInstallations.set(document, installation)
  try {
    await installation
  } catch (error) {
    importMapInstallations.delete(document)
    throw error
  }
}

const entrySpecifier = (
  manifest: StableCdnImportMapManifest,
  entry: StableCdnLoadEntry,
): string => {
  const specifier = manifest.entries[entry]
  if (!specifier) {
    throw new Error(`[cdn-stable] The import map has no "${entry}" entry`)
  }
  return specifier
}

export function loadStableCdn(): Promise<StableCdnCoreModules>
export function loadStableCdn(options: LoadStableCdnOptions): Promise<StableCdnModules>
export async function loadStableCdn(
  options: LoadStableCdnOptions = {},
): Promise<StableCdnModules> {
  if (typeof document === 'undefined') {
    throw new Error('[cdn-stable] loadStableCdn requires a browser document')
  }

  const entries = options.entries ?? ['core']
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('[cdn-stable] At least one stable CDN entry must be requested')
  }
  for (const entry of entries) {
    if (!['core', 'react', 'transform'].includes(entry)) {
      throw new Error(`[cdn-stable] Unsupported entry: ${String(entry)}`)
    }
  }

  const manifest = await loadStableCdnImportMapManifest()
  const importMap = {
    imports: manifest.imports,
    scopes: manifest.scopes,
  }
  await installStableCdnImportMap(document, importMap)

  const modules: StableCdnModules = {}
  for (const entry of new Set(entries)) {
    const specifier = entrySpecifier(manifest, entry)
    const url = importMap.imports[specifier]
    if (!url) {
      throw new Error(`[cdn-stable] The import map has no URL for "${specifier}"`)
    }

    try {
      Object.assign(modules, await import(url))
    } catch (error) {
      throw new Error(`[cdn-stable] Unable to load the "${entry}" entry from ${url}`, {
        cause: error,
      })
    }
  }

  return modules
}

export const buildStableCdnUrls = ({
  contract,
  provider,
  target = 'es2022',
}: BuildStableCdnUrlsOptions): StableCdnUrls => {
  assertContract(contract)
  const normalizedProvider = normalizeProvider(provider ?? contract.defaultProvider)
  const urls: Record<CdnStableEntryKey, string> =
    normalizedProvider === 'jsdelivr'
      ? {
          core: toJsDelivrUrl(contract, contract.entries.core),
          react: toJsDelivrUrl(contract, contract.entries.react),
          transform: toJsDelivrUrl(contract, contract.entries.transform),
        }
      : {
          core: toEsmShUrl(contract, contract.entries.core, target),
          react: toEsmShUrl(contract, contract.entries.react, target),
          transform: toEsmShUrl(contract, contract.entries.transform, target),
        }

  return {
    provider: normalizedProvider,
    target,
    packageName: contract.packageName,
    packageVersion: contract.packageVersion,
    urls,
  }
}

export const getStableCdnUrls = async (
  options: GetStableCdnUrlsOptions = {},
): Promise<StableCdnUrls> => {
  const contract = options.contract ?? (await loadCdnContract())

  return buildStableCdnUrls({
    contract,
    provider: options.provider,
    target: options.target,
  })
}
