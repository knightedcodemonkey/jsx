import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CLI_BIN = path.resolve(__dirname, '../dist/cli/init.js')

function setupProject() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-e2e-'))
  const pkgJson = {
    name: 'cli-e2e',
    version: '0.0.0',
    type: 'module',
  }
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify(pkgJson, null, 2),
  )
  return projectDir
}

describe('cli init e2e (dist binary)', () => {
  it('runs via node with dry-run flags', () => {
    const projectDir = setupProject()

    const result = spawnSync(
      process.execPath,
      [
        CLI_BIN,
        '--dry-run',
        '--skip-config',
        '--package-manager',
        'npm',
        '--wasm-package',
        '@scope/pkg@1.0.0',
      ],
      {
        cwd: projectDir,
        encoding: 'utf8',
        env: { ...process.env, KNIGHTED_JSX_CLI_TEST: '0' },
      },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Done!')
    expect(result.stdout).toContain('Runtime dependencies managed by the binding package')
    expect(result.stderr).toBe('')
  })

  it('preserves host peers and parses WASM after a clean reinstall', () => {
    const projectDir = setupProject()
    const pkgPath = path.join(projectDir, 'package.json')
    const hostDependencies = { '@emnapi/core': '1.11.3', '@emnapi/runtime': '1.11.3' }
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({
        name: 'cli-e2e',
        version: '0.0.0',
        dependencies: hostDependencies,
      }),
    )
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const runNpm = (args: string[]) =>
      spawnSync(npmBin, args, {
        cwd: projectDir,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      })
    try {
      const installed = runNpm(['install', '--ignore-scripts', '--prefer-offline'])
      expect([installed.status, installed.stderr]).toEqual([0, expect.any(String)])
      const cliEnv = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => key.toLowerCase() !== 'npm_execpath',
        ),
      )
      const result = spawnSync(
        process.execPath,
        [
          CLI_BIN,
          '--pm',
          'npm',
          '--wasm-package',
          '@oxc-parser/binding-wasm32-wasip1@0.156.0',
        ],
        {
          cwd: projectDir,
          encoding: 'utf8',
          env: {
            ...cliEnv,
            NODE_ENV: process.env.NODE_ENV ?? 'test',
            KNIGHTED_JSX_CLI_TEST: '0',
          },
        },
      )
      expect([result.status, result.stderr]).toEqual([0, expect.any(String)])
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      expect(pkg.dependencies).toEqual({
        ...hostDependencies,
        '@oxc-parser/binding-wasm32-wasip1': '0.156.0',
      })
      const parseWasm = () =>
        spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            'const binding = await import("@oxc-parser/binding-wasm32-wasip1"); const result = binding.parseSync("example.jsx", "<div />", { lang: "jsx" }); if (result.errors.length) throw new Error(JSON.stringify(result.errors))',
          ],
          { cwd: projectDir, encoding: 'utf8' },
        )
      const firstParse = parseWasm()
      expect([firstParse.status, firstParse.stderr]).toEqual([0, expect.any(String)])
      const validated = runNpm([
        'ls',
        '@emnapi/core',
        '@emnapi/runtime',
        '@napi-rs/wasm-runtime',
      ])
      expect([validated.status, validated.stderr]).toEqual([0, expect.any(String)])
      const reinstalled = runNpm(['ci', '--ignore-scripts', '--prefer-offline'])
      expect([reinstalled.status, reinstalled.stderr]).toEqual([0, expect.any(String)])
      const bindingRequire = createRequire(
        path.join(
          projectDir,
          'node_modules/@oxc-parser/binding-wasm32-wasip1/package.json',
        ),
      )
      for (const name of ['@emnapi/core', '@emnapi/runtime']) {
        const resolved = bindingRequire.resolve(`${name}/package.json`)
        expect(JSON.parse(fs.readFileSync(resolved, 'utf8')).version).toBe(
          '2.0.0-alpha.6',
        )
        const hostPath = path.join(projectDir, 'node_modules', name, 'package.json')
        expect(JSON.parse(fs.readFileSync(hostPath, 'utf8')).version).toBe('1.11.3')
      }
      const parsed = parseWasm()
      expect([parsed.status, parsed.stderr]).toEqual([0, expect.any(String)])
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  }, 60_000)
})
