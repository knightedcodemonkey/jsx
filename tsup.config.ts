import { defineConfig } from 'tsup'

const external = [
  'oxc-parser',
  '@oxc-parser/binding-darwin-arm64',
  '@oxc-parser/binding-linux-x64-gnu',
  '@oxc-parser/binding-wasm32-wasi',
]

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  outDir: 'dist/lite',
  format: ['esm'],
  target: 'es2022',
  minify: true,
  sourcemap: false,
  dts: false,
  clean: false,
  treeshake: true,
  splitting: false,
  shims: false,
  skipNodeModulesBundle: true,
  external,
})
