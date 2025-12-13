import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    init: 'src/cli/init.ts',
  },
  outDir: 'dist/cli',
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  dts: false,
  minify: false,
  sourcemap: false,
  splitting: false,
  treeshake: true,
  clean: false,
  shims: false,
  skipNodeModulesBundle: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
