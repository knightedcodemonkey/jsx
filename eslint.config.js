import js from '@eslint/js'
import pluginN from 'eslint-plugin-n'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      '**/dist/**',
      '**/next-app/out/**',
      '**/next-app/.next/**',
      'node_modules/**',
      'coverage/**',
      'coverage-v8/**',
      'coverage/vitest/**',
      'examples/browser/dist/**',
    ],
  },
  js.configs.recommended,
  pluginN.configs['flat/recommended'],
  ...tseslint.configs.recommended,
  {
    settings: {
      n: {
        tryExtensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'],
        allowModules: ['@oxc-project/types', 'jsdom', 'linkedom'],
      },
    },
    rules: {
      'n/no-extraneous-import': [
        'error',
        {
          allowModules: ['jsdom', 'linkedom'],
        },
      ],
    },
  },
  {
    files: ['src/**/*', 'test/**/*', 'scripts/**/*'],
    rules: {
      'n/no-unpublished-import': 'off',
      'n/no-unpublished-require': 'off',
    },
  },
  {
    files: ['test/fixtures/**/*'],
    rules: {
      'n/no-missing-import': 'off',
    },
  },
]
