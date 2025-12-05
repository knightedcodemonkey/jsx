#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { rspack } from '@rspack/core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const fixtureDir = path.join(rootDir, 'test/fixtures/rspack-app')
const fixtureEntry = path.join(fixtureDir, 'src/index.tsx')
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
    entry: fixtureEntry,
    mode: 'production',
    devtool: false,
    target: 'web',
    output: {
      path: outputDir,
      filename: 'bundle.js',
      clean: true,
    },
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
            },
          ],
        },
      ],
    },
  })

  const target = path.relative(rootDir, path.join(outputDir, 'bundle.js'))
  const bindingMessage = useStub
    ? 'using wasm stub (no real parser)'
    : 'using real wasm binding'
  console.log(`[build-rspack-fixture] Bundle written to ${target} (${bindingMessage})`)
} catch (error) {
  console.error('[build-rspack-fixture] Failed to build fixture bundle')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
