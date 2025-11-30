import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const demoRoot = path.resolve(__dirname, 'examples/browser')
const liteBuildPath = path.resolve(__dirname, 'dist/lite/index.js')
const liteAliasTarget = fs.existsSync(liteBuildPath)
  ? liteBuildPath
  : path.resolve(__dirname, 'src/index.ts')

export default defineConfig({
  root: demoRoot,
  resolve: {
    alias: [
      {
        find: '@knighted/jsx/lite',
        replacement: liteAliasTarget,
      },
      {
        find: '@knighted/jsx',
        replacement: path.resolve(__dirname, 'src/index.ts'),
      },
      {
        find: '@oxc-parser/binding-wasm32-wasi',
        replacement: path.resolve(__dirname, 'vendor/binding-wasm32-wasi'),
      },
    ],
  },
  build: {
    outDir: path.resolve(demoRoot, 'dist'),
    emptyOutDir: true,
  },
  server: {
    open: true,
  },
})
