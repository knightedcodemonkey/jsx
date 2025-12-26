import fsPromises from 'node:fs/promises'
import path from 'node:path'

import { rspack } from '@rspack/core'
import type { MultiStats, Stats } from '@rspack/core'
import ts from 'typescript'
import { describe, it, expect } from 'vitest'

const rootDir = path.resolve(__dirname, '..')
const loaderSource = path.resolve(rootDir, 'src/loader/jsx.ts')
const fixtureDir = path.resolve(rootDir, 'test/fixtures/rspack-app')
const fixtures = {
  hybrid: path.join(fixtureDir, 'src/index.tsx'),
  reactMode: path.join(fixtureDir, 'src/react-mode.tsx'),
}

const compilerOptions: ts.TranspileOptions['compilerOptions'] = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  esModuleInterop: true,
}

const diagnosticsHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: fileName => fileName,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => '\n',
}

const isRelativeSpecifier = (specifier: string) =>
  specifier.startsWith('./') || specifier.startsWith('../')

const collectRelativeSpecifiers = (sourceText: string, fileName: string) => {
  const specifiers = new Set<string>()
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const value = node.moduleSpecifier.text
      if (isRelativeSpecifier(value)) {
        specifiers.add(value)
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const value = node.moduleSpecifier.text
        if (isRelativeSpecifier(value)) {
          specifiers.add(value)
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return Array.from(specifiers)
}

const transpileToFile = async (sourcePath: string, targetPath: string) => {
  const sourceText = await fsPromises.readFile(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(sourceText, {
    compilerOptions,
    fileName: sourcePath,
    reportDiagnostics: true,
  })

  if (transpiled.diagnostics?.length) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(transpiled.diagnostics, diagnosticsHost),
    )
  }

  await fsPromises.mkdir(path.dirname(targetPath), { recursive: true })
  await fsPromises.writeFile(targetPath, transpiled.outputText ?? '', 'utf8')

  return sourceText
}

const pathExists = async (candidate: string) => {
  try {
    await fsPromises.access(candidate)
    return true
  } catch {
    return false
  }
}

const resolveModuleSourcePath = async (fromFile: string, specifier: string) => {
  const absolute = path.resolve(path.dirname(fromFile), specifier)
  const ext = path.extname(absolute)
  const base = ext ? absolute.slice(0, -ext.length) : absolute
  const candidates = new Set<string>()

  if (ext) {
    ;['.ts', '.tsx', '.mts', '.cts'].forEach(candidateExt => {
      candidates.add(base + candidateExt)
    })
    candidates.add(absolute)
  } else {
    candidates.add(`${absolute}.ts`)
    candidates.add(`${absolute}.tsx`)
    candidates.add(`${absolute}.mts`)
    candidates.add(`${absolute}.cts`)
    candidates.add(absolute)
    candidates.add(`${absolute}.js`)
    candidates.add(`${absolute}.jsx`)
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }

  return null
}

const compileModuleGraph = async (
  sourcePath: string,
  targetPath: string,
  seen = new Set<string>(),
) => {
  if (seen.has(sourcePath)) {
    return
  }

  seen.add(sourcePath)
  const sourceText = await transpileToFile(sourcePath, targetPath)
  const relativeImports = collectRelativeSpecifiers(sourceText, sourcePath)

  await Promise.all(
    relativeImports.map(async specifier => {
      const resolvedSource = await resolveModuleSourcePath(sourcePath, specifier)
      if (!resolvedSource) {
        throw new Error(
          `Failed to resolve ${specifier} imported from ${path.relative(rootDir, sourcePath)}`,
        )
      }

      const outputPath = path.resolve(path.dirname(targetPath), specifier)
      await compileModuleGraph(resolvedSource, outputPath, seen)
    }),
  )
}

const buildLoaderArtifact = async (tempDir: string) => {
  const compiledDir = path.join(tempDir, 'loader')
  await fsPromises.mkdir(compiledDir, { recursive: true })
  await fsPromises.writeFile(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }),
    'utf8',
  )
  const compiledPath = path.join(compiledDir, 'jsx.cjs')
  await compileModuleGraph(loaderSource, compiledPath)
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
        entry: {
          hybrid: fixtures.hybrid,
          reactMode: fixtures.reactMode,
        },
        mode: 'production',
        devtool: false,
        target: 'web',
        output: {
          path: outputPath,
          filename: '[name].js',
        },
        resolve: {
          extensions: ['.ts', '.tsx', '.js', '.jsx'],
          alias: {
            '@knighted/jsx': path.resolve(rootDir, 'dist/index.js'),
            '@knighted/jsx/react': path.resolve(rootDir, 'dist/react/index.js'),
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
                  options: {
                    tagModes: {
                      reactJsx: 'react',
                    },
                  },
                },
              ],
            },
          ],
        },
      })

      const hybridBundle = await fsPromises.readFile(
        path.join(outputPath, 'hybrid.js'),
        'utf8',
      )
      expect(hybridBundle).toContain('hybrid-element')
      expect(hybridBundle).toContain('Hybrid ready')
      expect(hybridBundle).toContain('Works with Lit + React')
      expect(hybridBundle).not.toContain('__JSX_LOADER_TAG_EXPR_')
      expect(hybridBundle).not.toContain('reactJsx`')

      const reactModeBundle = await fsPromises.readFile(
        path.join(outputPath, 'reactMode.js'),
        'utf8',
      )
      expect(reactModeBundle).toContain('react-mode-element')
      expect(reactModeBundle).toContain('React mode ready')
      expect(reactModeBundle).not.toContain('__JSX_LOADER_TAG_EXPR_')
    } finally {
      await fsPromises.rm(tempDir, { recursive: true, force: true })
    }
  })
})
