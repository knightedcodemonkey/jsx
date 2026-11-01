import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

const rootDir = process.cwd()
const manifestPath = path.join(rootDir, 'dist/cdn-importmap.json')
const lockPath = path.join(rootDir, 'cdn-importmap-lock.json')
const packageJsonPath = path.join(rootDir, 'package.json')
const packageLockPath = path.join(rootDir, 'package-lock.json')
const packageVersion = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  .version as string
const getNextAlphaVersion = (version: string) => {
  const match = /^(.*-alpha\.)(\d+)$/.exec(version)
  if (!match) {
    throw new Error(`Expected an alpha package version, received ${version}`)
  }
  return `${match[1]}${Number(match[2]) + 1}`
}
const nextAlphaVersion = getNextAlphaVersion(packageVersion)
const { serializeArtifact, validateCdnImportMapArtifacts } = await import(
  pathToFileURL(path.join(rootDir, 'scripts/generate-cdn-importmap.mjs')).href
)

type CdnImportMapArtifacts = {
  manifest: {
    assets: Array<{ url: string }>
    scopes: Record<string, Record<string, string>>
  }
  lockfile: {
    mapTemplate: {
      imports: Record<string, string>
      scopes: Record<string, Record<string, string>>
    }
    lock: {
      secondary: Record<string, Record<string, { installUrl: string }>>
    }
  }
  packageJson: {
    name: string
    version: string
    optionalDependencies: Record<string, string>
  }
  packageLock: {
    packages: Record<string, { version: string }>
  }
}

const readArtifacts = () => ({
  manifest: JSON.parse(
    fs.readFileSync(manifestPath, 'utf8'),
  ) as CdnImportMapArtifacts['manifest'],
  lockfile: JSON.parse(
    fs.readFileSync(lockPath, 'utf8'),
  ) as CdnImportMapArtifacts['lockfile'],
  packageJson: JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8'),
  ) as CdnImportMapArtifacts['packageJson'],
  packageLock: JSON.parse(
    fs.readFileSync(packageLockPath, 'utf8'),
  ) as CdnImportMapArtifacts['packageLock'],
})

describe('CDN import map artifacts', () => {
  it('exports and packages both generated artifacts and validates them during prepack', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

    expect(packageJson.files).toContain('dist')
    expect(packageJson.files).toContain('cdn-importmap-lock.json')
    expect(packageJson.exports['./cdn-importmap.json']).toBe('./dist/cdn-importmap.json')
    expect(packageJson.exports['./cdn-importmap-lock.json']).toBe(
      './cdn-importmap-lock.json',
    )
    expect(packageJson.scripts.prepack).toContain('check:cdn-importmap')
    expect(packageJson.scripts.pretest).toContain('check:cdn-importmap:candidate')
  })

  it('locks the published entries, transitive edges, React identity, and WASM assets', () => {
    const artifacts = readArtifacts()
    const result = validateCdnImportMapArtifacts(artifacts)

    expect(result).toMatchObject({
      packageName: '@knighted/jsx',
      packageVersion,
      resolutions: {
        '@napi-rs/wasm-runtime': '1.2.5',
        '@emnapi/core': '2.0.0-alpha.6',
        '@emnapi/runtime': '2.0.0-alpha.6',
        react: '19.3.1',
        'react-dom': '19.3.1',
      },
    })
    expect(
      artifacts.manifest.scopes[
        `https://ga.jspm.io/npm:@knighted/jsx@${packageVersion}/`
      ],
    ).toMatchObject({
      'oxc-parser': 'https://ga.jspm.io/npm:oxc-parser@0.156.0/src-js/wasm.js',
      'oxc-transform': 'https://ga.jspm.io/npm:oxc-transform@0.156.0/browser.js',
      'property-information':
        'https://ga.jspm.io/npm:property-information@7.1.0/index.js',
      'magic-string':
        'https://ga.jspm.io/npm:magic-string@0.30.21/dist/magic-string.es.mjs',
    })
    expect(artifacts.manifest.assets.map(asset => asset.url)).toEqual([
      'https://ga.jspm.io/npm:@oxc-parser/binding-wasm32-wasip1@0.156.0/parser.wasm32-wasip1.wasm',
      'https://ga.jspm.io/npm:@oxc-transform/binding-wasm32-wasip1@0.156.0/transform.wasm32-wasip1.wasm',
    ])
  })

  it('rejects a bare or unlocked transitive mapping', () => {
    const artifacts = readArtifacts()
    const selfScope = `https://ga.jspm.io/npm:@knighted/jsx@${packageVersion}/`
    const selfScopeTemplate = 'https://ga.jspm.io/npm:@knighted/jsx@__SELF_VERSION__/'
    const unstableUrl = 'https://ga.jspm.io/npm:property-information@latest/index.js'
    artifacts.manifest.scopes[selfScope]['property-information'] = unstableUrl
    artifacts.lockfile.mapTemplate.scopes[selfScopeTemplate]['property-information'] =
      unstableUrl

    expect(() => validateCdnImportMapArtifacts(artifacts)).toThrow(
      /not covered by the JSPM lock/,
    )
  })

  it('rejects a missing transitive source-map edge', () => {
    const artifacts = readArtifacts()
    const magicStringScope = 'https://ga.jspm.io/npm:magic-string@0.30.21/'
    delete artifacts.manifest.scopes[magicStringScope]['@jridgewell/sourcemap-codec']
    delete artifacts.lockfile.mapTemplate.scopes[magicStringScope][
      '@jridgewell/sourcemap-codec'
    ]

    expect(() => validateCdnImportMapArtifacts(artifacts)).toThrow(
      /Missing @jridgewell\/sourcemap-codec edge/,
    )
  })

  it('rejects an incompatible binding runtime edge', () => {
    const artifacts = readArtifacts()
    artifacts.lockfile.lock.secondary[
      'https://ga.jspm.io/npm:@oxc-parser/binding-wasm32-wasip1@0.156.0/'
    ]['@napi-rs/wasm-runtime'].installUrl =
      'https://ga.jspm.io/npm:@napi-rs/wasm-runtime@1.2.6/'

    expect(() => validateCdnImportMapArtifacts(artifacts)).toThrow(
      /must use the compatible WASM runtime/,
    )
  })

  it('serializes object keys deterministically', () => {
    expect(serializeArtifact({ z: 1, a: { y: 2, b: 3 } })).toBe(
      serializeArtifact({ a: { b: 3, y: 2 }, z: 1 }),
    )
  })

  it('rebases only self URLs for a package-version-only candidate', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'jsx-cdn-candidate-'))
    const originalLock = fs.readFileSync(lockPath, 'utf8')
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      packageJson.version = nextAlphaVersion
      await writeFile(
        path.join(temporaryRoot, 'package.json'),
        JSON.stringify(packageJson),
      )
      await cp(packageLockPath, path.join(temporaryRoot, 'package-lock.json'))
      await cp(lockPath, path.join(temporaryRoot, 'cdn-importmap-lock.json'))
      await cp(path.join(rootDir, 'scripts'), path.join(temporaryRoot, 'scripts'), {
        recursive: true,
      })
      await cp(path.join(rootDir, 'src/cli'), path.join(temporaryRoot, 'src/cli'), {
        recursive: true,
      })
      await cp(path.join(rootDir, 'dist'), path.join(temporaryRoot, 'dist'), {
        recursive: true,
      })
      await symlink(
        path.join(rootDir, 'node_modules'),
        path.join(temporaryRoot, 'node_modules'),
      )

      const checkOutput = execFileSync(
        process.execPath,
        [
          path.join(temporaryRoot, 'scripts/generate-cdn-importmap.mjs'),
          '--check',
          '--candidate',
        ],
        { cwd: temporaryRoot, encoding: 'utf8', stdio: 'pipe' },
      )
      expect(checkOutput).toContain('[cdn-importmap] validation passed')

      const candidateManifest = JSON.parse(
        fs.readFileSync(path.join(temporaryRoot, 'dist/cdn-importmap.json'), 'utf8'),
      )
      expect(candidateManifest.package.version).toBe(nextAlphaVersion)
      expect(candidateManifest.imports['@knighted/jsx']).toBe(
        `https://ga.jspm.io/npm:@knighted/jsx@${nextAlphaVersion}/dist/index.js`,
      )
      expect(
        fs.readFileSync(path.join(temporaryRoot, 'cdn-importmap-lock.json'), 'utf8'),
      ).toBe(originalLock)
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })
})
