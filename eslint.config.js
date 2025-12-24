import js from '@eslint/js'
import pluginN from 'eslint-plugin-n'
import playwright from 'eslint-plugin-playwright'
import unicorn from 'eslint-plugin-unicorn'
import vitest from '@vitest/eslint-plugin'
import tseslint from 'typescript-eslint'

const playwrightConfig = playwright.configs['flat/recommended']
const filenameCaseIgnore = ['^README(?:\\..+)?$']

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
    files: ['test/cli-init.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    plugins: {
      unicorn,
    },
    rules: {
      'unicorn/filename-case': [
        'error',
        {
          cases: {
            kebabCase: true,
          },
          ignore: filenameCaseIgnore,
        },
      ],
    },
  },
  {
    ...vitest.configs.recommended,
    files: ['test/**/*.test.{js,jsx,ts,tsx}', 'test/**/*.spec.{js,jsx,ts,tsx}'],
  },
  {
    files: ['src/jsx-runtime.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-namespace': 'off',
    },
  },
  {
    files: ['src/jsx-runtime.ts', 'test/jsx.test.ts'],
    rules: {
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          ignores: ['CustomEvent'],
        },
      ],
    },
  },
  {
    ...playwrightConfig,
    files: ['playwright/**/*.{ts,tsx,js}'],
  },
]
