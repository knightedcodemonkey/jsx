import js from '@eslint/js'
import pluginN from 'eslint-plugin-n'
import playwright from 'eslint-plugin-playwright'
import tseslint from 'typescript-eslint'

const playwrightConfig = playwright.configs['flat/recommended']

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
    files: ['src/cli/**/*', 'scripts/**/*'],
    rules: {
      'n/no-process-exit': 'off',
    },
  },
  {
    files: ['test/fixtures/**/*'],
    rules: {
      'n/no-missing-import': 'off',
    },
  },
  {
    ...playwrightConfig,
    files: ['playwright/**/*.{ts,tsx,js}'],
  },
]
