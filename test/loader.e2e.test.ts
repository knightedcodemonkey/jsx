import fsPromises from 'node:fs/promises'
import path from 'node:path'

import { rspack } from '@rspack/core'
import type { MultiStats, Stats } from '@rspack/core'
import ts from 'typescript'
import { describe, it, expect } from 'vitest'

const rootDir = path.resolve(__dirname, '..')
const loaderSource = path.resolve(rootDir, 'src/loader/jsx.ts')
const fixtureDir = path.resolve(rootDir, 'test/fixtures/rspack-app')
const fixtureEntry = path.join(fixtureDir, 'src/index.tsx')

const buildLoaderArtifact = async (tempDir: string) => {
  const compiledPath = path.join(tempDir, 'loader.cjs')
  const source = await fsPromises.readFile(loaderSource, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: loaderSource,
    reportDiagnostics: true,
  })

  if (transpiled.diagnostics?.length) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(transpiled.diagnostics, {
        getCanonicalFileName: fileName => fileName,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => '\n',
      }),
    )
  }

  await fsPromises.writeFile(compiledPath, transpiled.outputText, 'utf8')

  const proxyPath = path.join(tempDir, 'loader-proxy.cjs')
  await fsPromises.writeFile(
    proxyPath,
    `const loader = require(${JSON.stringify(compiledPath)});\nmodule.exports = loader.default || loader;\n`,
    'utf8',
  )

  return proxyPath
}

const runCompiler = (config: Parameters<typeof rspack>[0]) =>
  new Promise<void>((resolve, reject) => {
    const compiler = rspack(config)
    compiler.run((err: Error | null, stats?: Stats | MultiStats) => {
      compiler.close((closeErr?: Error | null) => {
        if (err || closeErr) {
          reject(err || closeErr)
          return
        }

        if (stats?.hasErrors()) {
          reject(new Error(stats.toString('errors-only')))
          return
        }

        resolve()
      })
    })
  })

describe('jsx loader integration', () => {
  it('bundles a Lit + React hybrid through rspack', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(rootDir, '.tmp-loader-'))

    try {
      const loaderPath = await buildLoaderArtifact(tempDir)
      const outputPath = path.join(tempDir, 'dist')

      await runCompiler({
        context: fixtureDir,
        entry: fixtureEntry,
        mode: 'production',
        devtool: false,
        target: 'web',
        output: {
          path: outputPath,
          filename: 'bundle.js',
        },
        resolve: {
          extensions: ['.ts', '.tsx', '.js', '.jsx'],
          alias: {
            '@knighted/jsx': path.resolve(rootDir, 'dist/index.js'),
            '@oxc-parser/binding-wasm32-wasi': path.resolve(
              fixtureDir,
              'stubs/oxc-wasm.js',
            ),
          },
        },
        module: {
          rules: [
            {
              test: /\.[jt]sx?$/,
              include: [path.join(fixtureDir, 'src')],
              use: [
                {
                  loader: 'builtin:swc-loader',
                  options: {
                    jsc: {
                      parser: {
                        syntax: 'typescript',
                        tsx: true,
                      },
                      transform: {
                        react: {
                          runtime: 'automatic',
                        },
                      },
                    },
                  },
                },
                {
                  loader: loaderPath,
                },
              ],
            },
          ],
        },
      })

      const bundle = await fsPromises.readFile(path.join(outputPath, 'bundle.js'), 'utf8')
      expect(bundle).toContain('hybrid-element')
      expect(bundle).toContain('Hybrid ready')
      expect(bundle).toContain('Works with Lit + React')
    } finally {
      await fsPromises.rm(tempDir, { recursive: true, force: true })
    }
  })
})
