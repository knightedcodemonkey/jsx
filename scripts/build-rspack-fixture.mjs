#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { rspack } from '@rspack/core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const fixtureDir = path.join(rootDir, 'test/fixtures/rspack-app')
const fixtureEntries = {
  hybrid: path.join(fixtureDir, 'src/index.tsx'),
  reactMode: path.join(fixtureDir, 'src/react-mode.tsx'),
}
const outputDir = path.join(fixtureDir, 'dist')
const loaderPath = path.join(rootDir, 'dist/loader/jsx.js')
const runtimePath = path.join(rootDir, 'dist/index.js')
const reactRuntimePath = path.join(rootDir, 'dist/react/index.js')
const wasmStubPath = path.join(fixtureDir, 'stubs/oxc-wasm.js')
const wasmBindingPath = path.join(
  rootDir,
  'node_modules/@oxc-parser/binding-wasm32-wasi/parser.wasi.cjs',
)
const useStub = process.argv.includes('--use-stub')

const ensureArtifacts = async () => {
  try {
    await fs.access(loaderPath)
    await fs.access(runtimePath)
    await fs.access(reactRuntimePath)
  } catch (error) {
    console.error(
      '[build-rspack-fixture] Missing dist artifacts. Run "npm run build" first.',
    )
    throw error
  }

  if (!useStub) {
    try {
      await fs.access(wasmBindingPath)
    } catch (error) {
      console.error(
        '[build-rspack-fixture] Missing @oxc-parser wasm binding. Run "npm run setup:wasm" (which installs the optional dependency) or pass --use-stub to fall back to the no-op binding.',
      )
      throw error
    }
  }
}

const runCompiler = config =>
  new Promise((resolve, reject) => {
    const compiler = rspack(config)
    compiler.run((err, stats) => {
      compiler.close(closeErr => {
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

try {
  await ensureArtifacts()

  await runCompiler({
    context: fixtureDir,
    entry: fixtureEntries,
    mode: 'production',
    devtool: false,
    target: 'web',
    output: {
      path: outputDir,
      filename: '[name].js',
      clean: true,
    },
    plugins: [
      new rspack.ProvidePlugin({
        React: ['react'],
      }),
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      alias: {
        '@knighted/jsx': runtimePath,
        '@knighted/jsx/react': reactRuntimePath,
        ...(useStub ? { '@oxc-parser/binding-wasm32-wasi': wasmStubPath } : {}),
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

  const outputs = ['hybrid.js', 'reactMode.js']
    .map(file => path.relative(rootDir, path.join(outputDir, file)))
    .join(', ')
  const bindingMessage = useStub
    ? 'using wasm stub (no real parser)'
    : 'using real wasm binding'
  console.log(`[build-rspack-fixture] Bundles written to ${outputs} (${bindingMessage})`)
} catch (error) {
  console.error('[build-rspack-fixture] Failed to build fixture bundle')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
