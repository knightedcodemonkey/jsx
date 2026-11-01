import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import {
  buildStableCdnUrls,
  type CdnContract,
  getStableCdnImportMap,
  getStableCdnUrls,
  loadStableCdn,
  loadCdnContract,
} from '../src/cdn-stable.js'

const fixturePackageVersion = '9.9.9'
const fixtureParserVersion = '9.1.0'
const fixtureTransformVersion = '9.2.0'
const fixtureBindingVersion = '9.3.0'
const fixtureRuntimeVersion = '9.4.0'
const fixtureEmnapiVersion = '2.0.0-alpha.6'
const fixtureImportMapManifest = {
  schemaVersion: 1,
  package: { name: '@knighted/jsx', version: '2.0.0-alpha.0' },
  provider: 'jspm.io',
  entries: {
    core: '@knighted/jsx',
    react: '@knighted/jsx/react',
    transform: '@knighted/jsx/transform',
    reactDomClient: 'react-dom/client',
  },
  resolutions: { react: '19.3.1', 'react-dom': '19.3.1' },
  assets: [
    {
      moduleUrl: 'https://ga.jspm.io/npm:binding@1.0.0/browser.js',
      packageName: 'binding',
      packageVersion: '1.0.0',
      url: 'https://ga.jspm.io/npm:binding@1.0.0/binding.wasm',
    },
  ],
  imports: {
    '@knighted/jsx': 'https://ga.jspm.io/npm:@knighted/jsx@2.0.0-alpha.0/dist/index.js',
    '@knighted/jsx/react':
      'https://ga.jspm.io/npm:@knighted/jsx@2.0.0-alpha.0/dist/react/index.js',
    '@knighted/jsx/transform':
      'https://ga.jspm.io/npm:@knighted/jsx@2.0.0-alpha.0/dist/transform.js',
    react: 'https://ga.jspm.io/npm:react@19.3.1/index.js',
    'react-dom': 'https://ga.jspm.io/npm:react-dom@19.3.1/index.js',
    'react-dom/client': 'https://ga.jspm.io/npm:react-dom@19.3.1/client.js',
  },
  scopes: {
    'https://ga.jspm.io/npm:@knighted/jsx@2.0.0-alpha.0/': {
      react: 'https://ga.jspm.io/npm:react@19.3.1/index.js',
      'property-information':
        'https://ga.jspm.io/npm:property-information@7.1.0/index.js',
    },
    'https://ga.jspm.io/npm:react-dom@19.3.1/': {
      react: 'https://ga.jspm.io/npm:react@19.3.1/index.js',
    },
  },
}

const contract: CdnContract = {
  contractVersion: 1,
  packageName: '@knighted/jsx',
  packageVersion: fixturePackageVersion,
  defaultProvider: 'esm',
  entries: {
    core: {
      subpath: '.',
      deps: {
        '@emnapi/core': fixtureEmnapiVersion,
        '@emnapi/runtime': fixtureEmnapiVersion,
        'oxc-parser': fixtureParserVersion,
        '@oxc-parser/binding-wasm32-wasip1': fixtureBindingVersion,
        '@napi-rs/wasm-runtime': fixtureRuntimeVersion,
      },
    },
    react: {
      subpath: './react',
      deps: {
        'oxc-parser': fixtureParserVersion,
        '@oxc-parser/binding-wasm32-wasip1': fixtureBindingVersion,
        '@napi-rs/wasm-runtime': fixtureRuntimeVersion,
      },
    },
    transform: {
      subpath: './transform',
      deps: {
        'oxc-parser': fixtureParserVersion,
        'oxc-transform': fixtureTransformVersion,
        '@oxc-parser/binding-wasm32-wasip1': fixtureBindingVersion,
        '@oxc-transform/binding-wasm32-wasip1': fixtureTransformVersion,
        '@napi-rs/wasm-runtime': fixtureRuntimeVersion,
      },
    },
  },
}

describe('buildStableCdnUrls', () => {
  it('generates binding-compatible pins rather than copying root runtime peers', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'jsx-cdn-compatible-'))
    try {
      await writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: '@knighted/jsx',
          version: '2.0.0-alpha.0',
          dependencies: {
            'oxc-parser': '^0.156.0',
            'oxc-transform': '^0.156.0',
            '@napi-rs/wasm-runtime': '~1.2.6',
            '@emnapi/core': '2.0.0-beta.2',
            '@emnapi/runtime': '2.0.0-beta.2',
          },
          optionalDependencies: { '@oxc-parser/binding-wasm32-wasip1': '0.156.0' },
        }),
      )
      execFileSync(
        process.execPath,
        [path.resolve('scripts/generate-cdn-contract.mjs')],
        { cwd: tempDir, stdio: 'pipe' },
      )
      const generated = JSON.parse(
        await readFile(path.join(tempDir, 'cdn-contract.json'), 'utf8'),
      )
      const result = buildStableCdnUrls({ contract: generated, provider: 'esm' })
      for (const url of Object.values(result.urls)) {
        const deps = new URL(url).searchParams.get('deps') ?? ''
        expect(deps).toContain('@napi-rs/wasm-runtime@1.2.5')
        expect(deps).toContain('@emnapi/core@2.0.0-alpha.6')
        expect(deps).toContain('@emnapi/runtime@2.0.0-alpha.6')
        expect(deps).not.toContain('beta.2')
        expect(deps).not.toContain('wasm-runtime@1.2.6')
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
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
      `deps=@emnapi/core@${fixtureEmnapiVersion},@emnapi/runtime@${fixtureEmnapiVersion},@napi-rs/wasm-runtime@${fixtureRuntimeVersion},@oxc-parser/binding-wasm32-wasip1@${fixtureBindingVersion},oxc-parser@${fixtureParserVersion}`,
    )
  })

  it('serializes dependency query strings in deterministic sorted order', () => {
    const unorderedContract: CdnContract = {
      ...contract,
      entries: {
        ...contract.entries,
        core: {
          ...contract.entries.core,
          deps: {
            'oxc-parser': fixtureParserVersion,
            '@napi-rs/wasm-runtime': fixtureRuntimeVersion,
            '@oxc-parser/binding-wasm32-wasip1': fixtureBindingVersion,
          },
        },
      },
    }

    const result = buildStableCdnUrls({
      contract: unorderedContract,
      provider: 'esm',
    })

    expect(decodeURIComponent(result.urls.core)).toContain(
      `deps=@napi-rs/wasm-runtime@${fixtureRuntimeVersion},@oxc-parser/binding-wasm32-wasip1@${fixtureBindingVersion},oxc-parser@${fixtureParserVersion}`,
    )
  })

  it('defaults to the contract default provider when provider is omitted', () => {
    const result = buildStableCdnUrls({
      contract,
    })

    expect(result.provider).toBe('esm')
  })

  it('uses jsdelivr when contract defaultProvider is jsdelivr', () => {
    const jsdelivrDefaultContract: CdnContract = {
      ...contract,
      defaultProvider: 'jsdelivr',
    }

    const result = buildStableCdnUrls({
      contract: jsdelivrDefaultContract,
    })

    expect(result.provider).toBe('jsdelivr')
    expect(result.urls.core).toBe(
      `https://cdn.jsdelivr.net/npm/@knighted/jsx@${fixturePackageVersion}/+esm`,
    )
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

const stubImportMapManifestUrl = () => {
  const RealUrl = URL
  vi.stubGlobal(
    'URL',
    class extends RealUrl {
      constructor(url: string | URL, base?: string | URL) {
        const source = String(url)
        const isManifestUrl =
          source === './cdn-importmap.json' || source.endsWith('/src/cdn-importmap.json')
        super(isManifestUrl ? 'https://cdn.example.test/cdn-importmap.json' : url, base)
      }
    },
  )
}

const stubImportMapManifestFetch = () => {
  stubImportMapManifestUrl()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => fixtureImportMapManifest })),
  )
}

const useFreshDocument = () => {
  const freshDocument = document.implementation.createHTMLDocument()
  vi.stubGlobal('document', freshDocument)
  return freshDocument
}

describe('getStableCdnImportMap', () => {
  it('reads and validates the packaged map from a file URL without fetching', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'jsx-cdn-local-map-'))
    const manifestPath = path.join(temporaryRoot, 'cdn-importmap.json')
    await writeFile(manifestPath, JSON.stringify(fixtureImportMapManifest))
    const RealUrl = URL
    const fetchMock = vi.fn()

    vi.stubGlobal(
      'URL',
      class extends RealUrl {
        constructor(url: string | URL, base?: string | URL) {
          super(
            url === './cdn-importmap.json' ||
              String(url).endsWith('/src/cdn-importmap.json')
              ? pathToFileURL(manifestPath).href
              : url,
            base,
          )
        }
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    try {
      await expect(getStableCdnImportMap()).resolves.toEqual({
        imports: fixtureImportMapManifest.imports,
        scopes: fixtureImportMapManifest.scopes,
      })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('returns a validated map without mutating document import maps', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => fixtureImportMapManifest,
    }))
    const importMapCount = document.querySelectorAll('script[type="importmap"]').length

    stubImportMapManifestUrl()
    vi.stubGlobal('fetch', fetchMock)

    try {
      const map = await getStableCdnImportMap()

      expect(map).toEqual({
        imports: fixtureImportMapManifest.imports,
        scopes: fixtureImportMapManifest.scopes,
      })
      expect(fetchMock).toHaveBeenCalledWith(
        'https://cdn.example.test/cdn-importmap.json',
      )
      expect(document.querySelectorAll('script[type="importmap"]')).toHaveLength(
        importMapCount,
      )
      expect(map.imports).not.toBe(fixtureImportMapManifest.imports)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects invalid manifest URLs and failed fetches', async () => {
    stubImportMapManifestUrl()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ...fixtureImportMapManifest,
          imports: {
            ...fixtureImportMapManifest.imports,
            unexpected: 'https://unpkg.com/react@19.3.1/index.js',
          },
        }),
      })),
    )

    try {
      await expect(getStableCdnImportMap()).rejects.toThrow(/unsupported URL/)
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 503 })),
      )
      await expect(getStableCdnImportMap()).rejects.toThrow(/503/)
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Promise.reject(new Error('offline'))),
      )
      await expect(getStableCdnImportMap()).rejects.toThrow(/Failed to fetch import map/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects malformed manifests and inconsistent package graph metadata', async () => {
    const invalidManifests: Array<{ value: unknown; error: RegExp }> = [
      { value: null, error: /Invalid stable CDN import map manifest/ },
      {
        value: { ...fixtureImportMapManifest, schemaVersion: 2 },
        error: /Invalid stable CDN import map manifest/,
      },
      {
        value: {
          ...fixtureImportMapManifest,
          package: { name: '@other/package', version: '1.0.0' },
        },
        error: /Invalid package identity/,
      },
      {
        value: {
          ...fixtureImportMapManifest,
          package: { name: '@knighted/jsx', version: 'latest' },
        },
        error: /Invalid package identity/,
      },
      {
        value: {
          ...fixtureImportMapManifest,
          entries: { ...fixtureImportMapManifest.entries, core: '@other/core' },
        },
        error: /Invalid "core" entry/,
      },
      {
        value: {
          ...fixtureImportMapManifest,
          imports: {
            ...fixtureImportMapManifest.imports,
            '@knighted/jsx':
              'https://ga.jspm.io/npm:@knighted/jsx@2.0.0-alpha.9/dist/index.js',
          },
        },
        error: /do not match the manifest package versions/,
      },
      {
        value: {
          ...fixtureImportMapManifest,
          scopes: {
            ...fixtureImportMapManifest.scopes,
            'https://ga.jspm.io/npm:@knighted/jsx@2.0.0-alpha.0/': {
              react: 'https://esm.sh/react@19.3.1',
            },
          },
        },
        error: /canonical module URL/,
      },
      {
        value: {
          ...fixtureImportMapManifest,
          scopes: {
            ...fixtureImportMapManifest.scopes,
            'file:///unexpected/': {},
          },
        },
        error: /Invalid import map scope/,
      },
      {
        value: {
          ...fixtureImportMapManifest,
          imports: {
            ...fixtureImportMapManifest.imports,
            unexpected: 'https://unpkg.com/react@19.3.1/index.js',
          },
        },
        error: /unsupported URL/,
      },
      {
        value: {
          ...fixtureImportMapManifest,
          assets: [
            { ...fixtureImportMapManifest.assets[0], url: 'https://unpkg.com/file.wasm' },
          ],
        },
        error: /Invalid asset entry/,
      },
    ]

    for (const invalid of invalidManifests) {
      stubImportMapManifestUrl()
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, json: async () => invalid.value })),
      )
      try {
        await expect(getStableCdnImportMap()).rejects.toThrow(invalid.error)
      } finally {
        vi.unstubAllGlobals()
      }
    }
  })
})

describe('loadStableCdn', () => {
  it('rejects malformed host import maps before changing the document', async () => {
    const invalidMaps: Array<{ text: string; error: RegExp }> = [
      { text: '{', error: /invalid JSON/ },
      { text: 'null', error: /must be an object/ },
      {
        text: JSON.stringify({ imports: { react: 19 } }),
        error: /invalid imports or scopes/,
      },
      {
        text: JSON.stringify({
          scopes: { 'https://ga.jspm.io/npm:host@1.0.0/': { react: 19 } },
        }),
        error: /invalid scope/,
      },
    ]

    for (const invalidMap of invalidMaps) {
      stubImportMapManifestFetch()
      const testDocument = useFreshDocument()
      const hostMap = testDocument.createElement('script')
      hostMap.type = 'importmap'
      hostMap.textContent = invalidMap.text
      testDocument.head.append(hostMap)

      try {
        await expect(loadStableCdn()).rejects.toThrow(invalidMap.error)
        expect(testDocument.querySelectorAll('script[type="importmap"]')).toHaveLength(1)
      } finally {
        vi.unstubAllGlobals()
        hostMap.remove()
      }
    }
  })

  it('rejects visible host mappings that conflict with the stable graph', async () => {
    stubImportMapManifestFetch()
    const testDocument = useFreshDocument()
    const hostMap = testDocument.createElement('script')
    hostMap.type = 'importmap'
    hostMap.textContent = JSON.stringify({
      imports: { react: 'https://esm.sh/react@19.3.1' },
    })
    testDocument.head.append(hostMap)

    try {
      await expect(loadStableCdn()).rejects.toThrow(/Import map conflict for "react"/)
      expect(testDocument.querySelectorAll('script[type="importmap"]')).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
      hostMap.remove()
    }
  })

  it('rejects React mappings in more-specific host scopes', async () => {
    stubImportMapManifestFetch()
    const testDocument = useFreshDocument()
    const hostMap = testDocument.createElement('script')
    hostMap.type = 'importmap'
    hostMap.textContent = JSON.stringify({
      scopes: {
        'https://ga.jspm.io/npm:@knighted/jsx@2.0.0-alpha.0/dist/': {
          react: fixtureImportMapManifest.imports.react,
        },
        'https://ga.jspm.io/npm:@knighted/jsx@2.0.0-alpha.0/dist/react/': {
          react: 'https://esm.sh/react@19.3.1',
        },
      },
    })
    testDocument.head.append(hostMap)

    try {
      await expect(loadStableCdn()).rejects.toThrow(/Import map conflict for "react"/)
      expect(testDocument.querySelectorAll('script[type="importmap"]')).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
      hostMap.remove()
    }
  })

  it('rejects exact and prefix remappings of locked helper URLs', async () => {
    const helperUrl = fixtureImportMapManifest.imports['@knighted/jsx']
    const remappings = [
      { [helperUrl]: 'https://esm.sh/replacement.js' },
      {
        'https://ga.jspm.io/npm:@knighted/jsx@2.0.0-alpha.0/':
          'https://esm.sh/@knighted/jsx@2.0.0-alpha.0/',
      },
      {
        'https://ga.jspm.io/': 'https://esm.sh/',
        'https://ga.jspm.io/npm:@knighted/jsx@2.0.0-alpha.0/':
          'https://esm.sh/@knighted/jsx@2.0.0-alpha.0/',
      },
    ]

    for (const imports of remappings) {
      stubImportMapManifestFetch()
      const testDocument = useFreshDocument()
      const hostMap = testDocument.createElement('script')
      hostMap.type = 'importmap'
      hostMap.textContent = JSON.stringify({ imports })
      testDocument.head.append(hostMap)

      try {
        await expect(loadStableCdn()).rejects.toThrow(/Import map conflict/)
        expect(testDocument.querySelectorAll('script[type="importmap"]')).toHaveLength(1)
      } finally {
        vi.unstubAllGlobals()
        hostMap.remove()
      }
    }
  })

  it('adds only missing mappings and reuses the document installation', async () => {
    stubImportMapManifestFetch()
    const testDocument = useFreshDocument()
    const hostMap = testDocument.createElement('script')
    hostMap.type = 'importmap'
    hostMap.textContent = JSON.stringify({
      imports: { react: fixtureImportMapManifest.imports.react },
    })
    testDocument.head.append(hostMap)

    try {
      await expect(loadStableCdn()).rejects.toThrow(/Unable to load the "core" entry/)
      const maps = Array.from(
        testDocument.querySelectorAll<HTMLScriptElement>('script[type="importmap"]'),
      )
      expect(maps).toHaveLength(2)
      const additions = JSON.parse(maps[1]?.textContent ?? '{}')
      expect(additions.imports.react).toBeUndefined()
      expect(additions.imports['@knighted/jsx']).toBe(
        fixtureImportMapManifest.imports['@knighted/jsx'],
      )

      await expect(loadStableCdn()).rejects.toThrow(/Unable to load the "core" entry/)
      expect(testDocument.querySelectorAll('script[type="importmap"]')).toHaveLength(2)
    } finally {
      vi.unstubAllGlobals()
      hostMap.remove()
      testDocument
        .querySelectorAll('script[type="importmap"]')
        .forEach(script => script.remove())
    }
  })

  it('does not append a map when the host already supplies the complete graph', async () => {
    stubImportMapManifestFetch()
    const testDocument = useFreshDocument()
    const hostMap = testDocument.createElement('script')
    hostMap.type = 'importmap'
    hostMap.textContent = JSON.stringify({
      imports: fixtureImportMapManifest.imports,
      scopes: fixtureImportMapManifest.scopes,
    })
    testDocument.head.append(hostMap)

    try {
      await expect(loadStableCdn()).rejects.toThrow(/Unable to load the "core" entry/)
      expect(testDocument.querySelectorAll('script[type="importmap"]')).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
      hostMap.remove()
    }
  })

  it('rejects when the document has no head', async () => {
    stubImportMapManifestFetch()
    vi.stubGlobal('document', { head: null } as unknown as Document)

    try {
      await expect(loadStableCdn()).rejects.toThrow(/document has no head/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects outside a browser document', async () => {
    vi.stubGlobal('document', undefined)

    try {
      await expect(loadStableCdn()).rejects.toThrow(/requires a browser document/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects empty or unsupported entry requests before loading the manifest', async () => {
    await expect(loadStableCdn({ entries: [] })).rejects.toThrow(/At least one/)
    await expect(loadStableCdn({ entries: ['unsupported' as 'core'] })).rejects.toThrow(
      /Unsupported entry/,
    )
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
