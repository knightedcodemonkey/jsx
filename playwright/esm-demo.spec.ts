import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { build } from 'vite'

const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const hybridSelectors = {
  reactRuntimeButton: '#react-runtime-demo .react-panel button',
  reactRuntimeCounter: '#react-runtime-demo .react-panel p',
  litHost: 'lit-hosts-react',
  litReactBadge: 'lit-hosts-react .hybrid-react-badge',
  liteMetrics: '#lite-entrypaths .lite-metric',
  createElementCard: '.create-element-card',
  createElementCounter: '.create-element-value',
  createElementNodeType: '.create-element-node-type',
  createElementButton: '.create-element-button',
  createElementFragmentItems: '.create-element-fragment-item',
}

const overviewSelectors = {
  card: '.overview-card',
  capabilityItems: '.overview-card .capability-item',
}

test('clean consumer browser build transforms TypeScript and JSX with both WASM bindings', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-browser-consumer-'))
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  try {
    const packed = JSON.parse(
      execFileSync(
        npmBin,
        ['pack', '--ignore-scripts', '--json', '--pack-destination', projectDir],
        { cwd: process.cwd(), encoding: 'utf8', shell: process.platform === 'win32' },
      ),
    )
    const sourcePackage = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    expect(packed[0].version).toBe(sourcePackage.version)
    expect(packed[0].files).toEqual(
      expect.arrayContaining(
        [
          'dist/index.js',
          'dist/react/index.js',
          'dist/transform.js',
          'dist/cdn-stable.js',
          'dist/cli/init.js',
          'cdn-contract.json',
        ].map(filePath => expect.objectContaining({ path: filePath })),
      ),
    )
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({
        name: 'jsx-browser-consumer',
        private: true,
        type: 'module',
        dependencies: { '@knighted/jsx': `file:./${packed[0].filename}` },
      }),
    )
    execFileSync(npmBin, ['install', '--ignore-scripts', '--prefer-offline'], {
      cwd: projectDir,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    })
    const installedRoot = path.join(projectDir, 'node_modules/@knighted/jsx')
    const installedPackage = JSON.parse(
      fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf8'),
    )
    const contract = JSON.parse(
      fs.readFileSync(path.join(installedRoot, 'cdn-contract.json'), 'utf8'),
    )
    expect(installedPackage.version).toBe(sourcePackage.version)
    expect(contract.packageVersion).toBe(installedPackage.version)
    expect(installedPackage.exports['./cdn-stable'].import).toBe('./dist/cdn-stable.js')
    expect(installedPackage.exports['./transform'].import).toBe('./dist/transform.js')
    for (const key of ['core', 'react', 'transform']) {
      expect(contract.entries[key].deps).toMatchObject({
        '@napi-rs/wasm-runtime': '1.2.5',
        '@emnapi/core': '2.0.0-alpha.6',
        '@emnapi/runtime': '2.0.0-alpha.6',
      })
    }
    const consumerCli = path.join(
      projectDir,
      'node_modules/@knighted/jsx/dist/cli/init.js',
    )
    for (const name of [
      '@oxc-parser/binding-wasm32-wasip1',
      '@oxc-transform/binding-wasm32-wasip1',
    ]) {
      execFileSync(
        process.execPath,
        [consumerCli, '--pm', 'npm', '--wasm-package', `${name}@0.156.0`],
        {
          cwd: projectDir,
          stdio: 'pipe',
          env: { ...process.env, KNIGHTED_JSX_CLI_TEST: '0' },
        },
      )
    }
    fs.writeFileSync(
      path.join(projectDir, 'index.html'),
      '<!doctype html><body><script type="module" src="/entry.js"></script></body>',
    )
    fs.writeFileSync(
      path.join(projectDir, 'entry.js'),
      `import { transformJsxSource } from '@knighted/jsx/transform'
document.body.textContent = JSON.stringify(transformJsxSource('const answer: number = 42; const view = <div>{answer}</div>', { typescript: 'strip' }))`,
    )
    const outputDir = path.join(projectDir, 'dist')
    await build({
      configFile: false,
      root: projectDir,
      logLevel: 'error',
      build: { outDir: outputDir, target: 'esnext' },
    })
    await page.route('http://jsx-browser-consumer.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      const filePath = path.join(outputDir, pathname === '/' ? 'index.html' : pathname)
      const contentType = filePath.endsWith('.wasm')
        ? 'application/wasm'
        : filePath.endsWith('.js')
          ? 'text/javascript'
          : 'text/html'
      await route.fulfill({ body: fs.readFileSync(filePath), contentType })
    })
    await page.goto('http://jsx-browser-consumer.test/')
    await expect(page.locator('body')).toContainText('createElement', { timeout: 30_000 })
    const result = JSON.parse(await page.locator('body').innerText())
    expect(result.changed).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.code).not.toContain(': number')
    expect(result.code).toContain('React.createElement')
    expect(pageErrors).toEqual([])
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true })
  }
})

test('standalone CDN demo initializes the parser and renders interactive counters', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))

  await page.goto('/examples/esm-demo.html')

  const counterButton = page.getByRole('button', { name: 'Increment', exact: true })
  const counterLabel = page.locator('.counter-value')

  await expect
    .poll(async () => (pageErrors.length ? pageErrors : counterLabel.count()), {
      timeout: 60_000,
    })
    .not.toBe(0)
  expect(pageErrors).toEqual([])
  await expect(counterLabel).toHaveText('0')
  await counterButton.click()
  await expect(counterLabel).toHaveText('1')

  const reactCounter = page
    .locator(hybridSelectors.reactRuntimeCounter)
    .filter({ hasText: 'Button clicks' })

  await expect(reactCounter).toContainText('Button clicks: 0')
  await page.locator(hybridSelectors.reactRuntimeButton).click()
  await expect(reactCounter).toContainText('Button clicks: 1')
  await expect(page.locator('#demo-loading')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

/**
 * Tests the local E2E fixture to ensure that the current build works as expected.
 */
test.describe('esm demo via local dist fixture', () => {
  test('renders nested DOM trees and increments counter', async ({ page }) => {
    await page.goto('/test/fixtures/e2e.html')

    const counterButton = page.getByRole('button', { name: 'Increment', exact: true })
    const counterLabel = page.locator('.counter-value')

    await expect(counterLabel).toHaveText('0')
    await counterButton.click()
    await expect(counterLabel).toHaveText('1')
    await counterButton.click()
    await expect(counterLabel).toHaveText('2')

    const overviewCard = page.locator(overviewSelectors.card)
    await expect(overviewCard).toBeVisible()
    await expect(page.locator(overviewSelectors.capabilityItems)).toHaveCount(5)
    await expect(page.locator(overviewSelectors.capabilityItems).first()).toContainText(
      'DOM template tag',
    )
  })

  test('bridges lite tree with React + Lit hybrid widget', async ({ page }) => {
    await page.goto('/test/fixtures/e2e.html')

    const reactPanelButton = page.locator(hybridSelectors.reactRuntimeButton)
    const reactPanelCounter = page
      .locator(hybridSelectors.reactRuntimeCounter)
      .filter({ hasText: 'Button clicks' })

    await expect(reactPanelCounter).toContainText('Button clicks: 0')
    await reactPanelButton.click()
    await expect(reactPanelCounter).toContainText('Button clicks: 1')

    const litHost = page.locator(hybridSelectors.litHost)
    await expect(litHost).toBeVisible()
    await expect(
      page.locator(`${hybridSelectors.litReactBadge} header strong`),
    ).toHaveText(/Connected|Paused/)
    await expect(page.locator(hybridSelectors.liteMetrics)).toHaveCount(4)
  })

  test('renders createElement + Fragment output as real DOM nodes', async ({ page }) => {
    await page.goto('/test/fixtures/e2e.html')

    const createElementCard = page.locator(hybridSelectors.createElementCard)
    const createElementCounter = page.locator(hybridSelectors.createElementCounter)
    const createElementButton = page.locator(hybridSelectors.createElementButton)

    await expect(createElementCard).toBeVisible()
    await expect(page.locator(hybridSelectors.createElementNodeType)).toHaveText('1')
    await expect(page.locator(hybridSelectors.createElementFragmentItems)).toHaveCount(2)

    await expect(createElementCounter).toHaveText('0')
    await createElementButton.click()
    await expect(createElementCounter).toHaveText('1')
  })
})
