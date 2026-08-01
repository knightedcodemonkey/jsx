import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  buildStableCdnUrls,
  type CdnContract,
  getStableCdnUrls,
  loadCdnContract,
} from '../src/cdn-stable.js'

const fixturePackageVersion = '9.9.9'
const fixtureParserVersion = '9.1.0'
const fixtureTransformVersion = '9.2.0'
const fixtureBindingVersion = '9.3.0'
const fixtureRuntimeVersion = '9.4.0'

const contract: CdnContract = {
  contractVersion: 1,
  packageName: '@knighted/jsx',
  packageVersion: fixturePackageVersion,
  defaultProvider: 'esm',
  entries: {
    core: {
      subpath: '.',
      deps: {
        'oxc-parser': fixtureParserVersion,
        '@oxc-parser/binding-wasm32-wasi': fixtureBindingVersion,
        '@napi-rs/wasm-runtime': fixtureRuntimeVersion,
      },
    },
    react: {
      subpath: './react',
      deps: {
        'oxc-parser': fixtureParserVersion,
        '@oxc-parser/binding-wasm32-wasi': fixtureBindingVersion,
        '@napi-rs/wasm-runtime': fixtureRuntimeVersion,
      },
    },
    transform: {
      subpath: './transform',
      deps: {
        'oxc-parser': fixtureParserVersion,
        'oxc-transform': fixtureTransformVersion,
        '@oxc-parser/binding-wasm32-wasi': fixtureBindingVersion,
        '@oxc-transform/binding-wasm32-wasi': fixtureTransformVersion,
        '@napi-rs/wasm-runtime': fixtureRuntimeVersion,
      },
    },
  },
}

describe('buildStableCdnUrls', () => {
  it('builds esm.sh URLs for all stable entries', () => {
    const result = buildStableCdnUrls({
      contract,
      provider: 'esm',
      target: 'es2022',
    })

    expect(result.provider).toBe('esm')
    expect(result.urls.core).toContain(
      `https://esm.sh/@knighted/jsx@${fixturePackageVersion}?bundle&`,
    )
    expect(result.urls.react).toContain(
      `https://esm.sh/@knighted/jsx@${fixturePackageVersion}/react?bundle&`,
    )
    expect(result.urls.transform).toContain(
      `https://esm.sh/@knighted/jsx@${fixturePackageVersion}/transform?bundle&`,
    )

    expect(decodeURIComponent(result.urls.core)).toContain(
      `deps=oxc-parser@${fixtureParserVersion},@oxc-parser/binding-wasm32-wasi@${fixtureBindingVersion},@napi-rs/wasm-runtime@${fixtureRuntimeVersion}`,
    )
  })

  it('defaults to esm when provider is omitted', () => {
    const result = buildStableCdnUrls({
      contract,
    })

    expect(result.provider).toBe('esm')
  })

  it('builds jsDelivr +esm URLs for all stable entries', () => {
    const result = buildStableCdnUrls({
      contract,
      provider: 'jsdelivr',
      target: 'es2022',
    })

    expect(result.provider).toBe('jsdelivr')
    expect(result.urls.core).toBe(
      `https://cdn.jsdelivr.net/npm/@knighted/jsx@${fixturePackageVersion}/+esm`,
    )
    expect(result.urls.react).toBe(
      `https://cdn.jsdelivr.net/npm/@knighted/jsx@${fixturePackageVersion}/react/+esm`,
    )
    expect(result.urls.transform).toBe(
      `https://cdn.jsdelivr.net/npm/@knighted/jsx@${fixturePackageVersion}/transform/+esm`,
    )
  })

  it('throws when a contract entry is missing', () => {
    const invalid = {
      ...contract,
      entries: {
        ...contract.entries,
        react: undefined as unknown as CdnContract['entries']['react'],
      },
    }

    expect(() =>
      buildStableCdnUrls({
        contract: invalid,
      }),
    ).toThrow(/Missing contract entry: react/)
  })

  it('throws when provider is unsupported', () => {
    expect(() =>
      buildStableCdnUrls({
        contract,
        provider: 'esm.sh' as unknown as 'esm',
      }),
    ).toThrow(/Unsupported provider/)
  })

  it('throws when contract is not an object', () => {
    expect(() =>
      buildStableCdnUrls({
        contract: null as unknown as CdnContract,
      }),
    ).toThrow(/valid contract object/)
  })

  it('throws when a contract entry subpath is invalid', () => {
    const invalid = {
      ...contract,
      entries: {
        ...contract.entries,
        core: {
          ...contract.entries.core,
          subpath: '',
        },
      },
    }

    expect(() =>
      buildStableCdnUrls({
        contract: invalid,
      }),
    ).toThrow(/Invalid subpath for contract entry: core/)
  })

  it('throws when a contract entry dependency map is missing', () => {
    const invalid = {
      ...contract,
      entries: {
        ...contract.entries,
        core: {
          ...contract.entries.core,
          deps: undefined as unknown as Record<string, string>,
        },
      },
    }

    expect(() =>
      buildStableCdnUrls({
        contract: invalid,
      }),
    ).toThrow(/Missing dependency map for contract entry: core/)
  })
})

describe('loadCdnContract', () => {
  it('loads the generated local contract in Node', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'jsx-cdn-contract-'))
    const contractPath = path.join(tempDir, 'cdn-contract.json')
    await writeFile(contractPath, JSON.stringify(contract), 'utf8')

    const RealUrl = URL
    const fakeUrl = function () {
      return new RealUrl(`file://${contractPath}`)
    } as unknown as typeof URL

    vi.stubGlobal('URL', fakeUrl)

    try {
      const loaded = await loadCdnContract()

      expect(loaded.packageName).toBe('@knighted/jsx')
      expect(loaded.entries.core).toBeDefined()
      expect(loaded.entries.react).toBeDefined()
      expect(loaded.entries.transform).toBeDefined()
    } finally {
      vi.unstubAllGlobals()
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('throws when remote contract fetch is not ok', async () => {
    const RealUrl = URL
    const fakeUrl = function () {
      return new RealUrl('https://cdn.example.test/cdn-contract.json')
    } as unknown as typeof URL

    vi.stubGlobal('URL', fakeUrl)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 })),
    )

    try {
      await expect(loadCdnContract()).rejects.toThrow(/503/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('getStableCdnUrls', () => {
  it('returns stable urls using an explicit contract without file I/O', async () => {
    const result = await getStableCdnUrls({
      contract,
      target: 'es2022',
    })

    expect(result.packageName).toBe('@knighted/jsx')
    expect(result.packageVersion).toBe(fixturePackageVersion)
    expect(result.urls.core).toContain('target=es2022')
  })

  it('loads contract from fetch when explicit contract is omitted', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => contract,
    }))

    const RealUrl = URL
    const fakeUrl = function () {
      return new RealUrl('https://cdn.example.test/cdn-contract.json')
    } as unknown as typeof URL

    vi.stubGlobal('URL', fakeUrl)
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await getStableCdnUrls({
        provider: 'jsdelivr',
      })

      expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.test/cdn-contract.json')
      expect(result.provider).toBe('jsdelivr')
      expect(result.packageVersion).toBe(fixturePackageVersion)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
