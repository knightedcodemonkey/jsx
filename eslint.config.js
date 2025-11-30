import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'coverage-v8/**',
      'coverage/vitest/**',
      'examples/browser/dist/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
]
