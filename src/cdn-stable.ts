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
