import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const demoRoot = path.resolve(__dirname, 'examples/browser')

export default defineConfig({
  root: demoRoot,
  resolve: {
    alias: {
      '@knighted/jsx': path.resolve(__dirname, 'src/index.ts'),
      '@oxc-parser/binding-wasm32-wasi': path.resolve(
        __dirname,
        'vendor/binding-wasm32-wasi',
      ),
    },
  },
  build: {
    outDir: path.resolve(demoRoot, 'dist'),
    emptyOutDir: true,
  },
  server: {
    open: true,
  },
})
