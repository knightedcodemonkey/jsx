import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

type CdnSmokeResult = {
  status: 'running' | 'ok' | 'error'
  error?: string
  reactVersion?: string
  dom?: string
  jsxIsReactElement?: boolean
  mapHasReactDom?: boolean
  importMapCount?: number
  repeatedCoreIsSameModule?: boolean
  transformed?: {
    changed: boolean
    diagnostics: unknown[]
    code: string
  }
}

const rootDir = process.cwd()
const manifest = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'dist/cdn-importmap.json'), 'utf8'),
) as {
  package: { name: string; version: string }
  imports: Record<string, string>
  scopes: Record<string, Record<string, string>>
  assets: Array<{ url: string }>
}
const lockfile = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'cdn-importmap-lock.json'), 'utf8'),
) as {
  lock: {
    primary: Record<string, { installUrl: string }>
    secondary: Record<string, Record<string, { installUrl: string }>>
    flattened: Record<string, { installUrl: string }>
  }
}

const lockInstallUrls = [
  ...Object.values(lockfile.lock.primary),
  ...Object.values(lockfile.lock.secondary).flatMap(Object.values),
  ...Object.values(lockfile.lock.flattened),
].map(entry =>
  entry.installUrl.replaceAll(
    'https://ga.jspm.io/npm:@knighted/jsx@__SELF_VERSION__/',
    `https://ga.jspm.io/npm:${manifest.package.name}@${manifest.package.version}/`,
  ),
)

const candidatePackageUrl = `https://ga.jspm.io/npm:${manifest.package.name}@${manifest.package.version}/`
const liveCdnMode = process.env.KNIGHTED_CDN_IMPORTMAP_LIVE === '1'
const stableCdnHelperUrl = liveCdnMode
  ? `https://cdn.jsdelivr.net/npm/${manifest.package.name}@${manifest.package.version}/dist/cdn-stable.js`
  : '/dist/cdn-stable.js'

const routeCandidatePackage = async (page: import('@playwright/test').Page) => {
  if (liveCdnMode) {
    return
  }

  const candidatePath = new URL(candidatePackageUrl).pathname
  const distPath = path.resolve(rootDir, 'dist')
  await page.route(
    url => url.href.startsWith(candidatePackageUrl),
    async route => {
      const requestUrl = new URL(route.request().url())
      const packagePath = requestUrl.pathname.slice(candidatePath.length)
      const filePath = path.resolve(rootDir, packagePath)

      if (!filePath.startsWith(`${distPath}${path.sep}`)) {
        await route.fulfill({ status: 404 })
        return
      }

      let body: Buffer
      try {
        body = fs.readFileSync(filePath)
      } catch {
        await route.fulfill({ status: 404 })
        return
      }

      const contentType = filePath.endsWith('.wasm')
        ? 'application/wasm'
        : filePath.endsWith('.json')
          ? 'application/json'
          : 'text/javascript'
      await route.fulfill({ body, contentType })
    },
  )
}

test('frozen CDN graph works in standalone Chromium and every request is locked', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await routeCandidatePackage(page)
  await page.goto('https://ga.jspm.io/')

  const requests: Array<{ url: string; resourceType: string }> = []
  const responses = new Map<string, number>()
  const pageErrors: string[] = []
  page.on('request', request => {
    requests.push({ url: request.url(), resourceType: request.resourceType() })
  })
  page.on('response', response => responses.set(response.url(), response.status()))
  page.on('pageerror', error => pageErrors.push(error.message))

  const moduleSource = [
    "globalThis.__cdnSmokeResult = { status: 'running' }",
    'try {',
    "  const { jsx } = await import('@knighted/jsx')",
    "  const { reactJsx } = await import('@knighted/jsx/react')",
    "  const { transformJsxSource } = await import('@knighted/jsx/transform')",
    "  const { createRoot } = await import('react-dom/client')",
    "  const React = await import('react')",
    '  document.body.append(jsx`<p id="dom">DOM parser ok</p>`)',
    '  function Counter() {',
    '    const [count, setCount] = React.useState(0)',
    "    return React.createElement('div', null, reactJsx`<span id=\"react-jsx\">React JSX identity</span>`, React.createElement('button', { id: 'counter', onClick: () => setCount(count + 1) }, 'Count: ' + count))",
    '  }',
    "  createRoot(document.querySelector('#root')).render(React.createElement(Counter))",
    "  const transformed = transformJsxSource('const answer: number = 42; const view = <div>{answer}</div>', { typescript: 'strip' })",
    '  globalThis.__cdnSmokeResult = {',
    "    status: 'ok',",
    '    reactVersion: React.version,',
    "    dom: document.querySelector('#dom')?.textContent,",
    '    jsxIsReactElement: React.isValidElement(reactJsx`<i />`),',
    '    transformed: { changed: transformed.changed, diagnostics: transformed.diagnostics, code: transformed.code },',
    '  }',
    '} catch (error) {',
    "  globalThis.__cdnSmokeResult = { status: 'error', error: error?.stack || String(error) }",
    '}',
  ].join('\n')

  const importMap = JSON.stringify({ imports: manifest.imports, scopes: manifest.scopes })
  await page.setContent(
    `<!doctype html><script type="importmap">${importMap}</script><div id="root"></div><script type="module">${moduleSource}</script>`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.waitForFunction(
    () =>
      ['ok', 'error'].includes(
        (window as Window & { __cdnSmokeResult?: CdnSmokeResult }).__cdnSmokeResult
          ?.status ?? 'running',
      ),
    { timeout: 110_000 },
  )

  const result = await page.evaluate(
    () => (window as Window & { __cdnSmokeResult?: CdnSmokeResult }).__cdnSmokeResult,
  )
  expect(result).toMatchObject({
    status: 'ok',
    reactVersion: '19.3.1',
    dom: 'DOM parser ok',
    jsxIsReactElement: true,
    transformed: { changed: true, diagnostics: [] },
  })
  expect(result?.transformed?.code).not.toContain(': number')
  await expect(page.getByRole('button', { name: 'Count: 0' })).toBeVisible()
  await page.getByRole('button', { name: 'Count: 0' }).click()
  await expect(page.getByRole('button', { name: 'Count: 1' })).toBeVisible()
  await expect(page.locator('#react-jsx')).toHaveText('React JSX identity')
  expect(pageErrors).toEqual([])

  const providerRequests = requests.filter(request =>
    request.url.startsWith('https://ga.jspm.io/'),
  )
  expect(providerRequests.length).toBeGreaterThan(10)
  for (const request of providerRequests) {
    expect(
      lockInstallUrls.some(installUrl => request.url.startsWith(installUrl)),
      `unlocked provider request: ${request.url}`,
    ).toBe(true)
    expect(request.resourceType).not.toBe('worker')
  }

  for (const asset of manifest.assets) {
    expect(providerRequests.some(request => request.url === asset.url)).toBe(true)
    expect(responses.get(asset.url)).toBe(200)
  }
})

test('stable CDN loader installs the packaged map before importing runtime entries', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await routeCandidatePackage(page)
  await page.goto('/')

  const requests: Array<{ url: string; resourceType: string }> = []
  const responses = new Map<string, number>()
  const pageErrors: string[] = []
  page.on('request', request => {
    requests.push({ url: request.url(), resourceType: request.resourceType() })
  })
  page.on('response', response => responses.set(response.url(), response.status()))
  page.on('pageerror', error => pageErrors.push(error.message))

  const moduleSource = [
    "globalThis.__cdnSmokeResult = { status: 'running' }",
    'try {',
    `  const { getStableCdnImportMap, loadStableCdn } = await import(${JSON.stringify(stableCdnHelperUrl)})`,
    '  const initialImportMapCount = document.querySelectorAll(\'script[type="importmap"]\').length',
    '  const map = await getStableCdnImportMap()',
    '  const countAfterPureMap = document.querySelectorAll(\'script[type="importmap"]\').length',
    "  const modules = await loadStableCdn({ entries: ['core', 'react', 'transform'] })",
    "  const React = await import('react')",
    "  const { createRoot } = await import('react-dom/client')",
    '  document.body.append(modules.jsx`<p id="dom">DOM parser ok</p>`)',
    '  function Counter() {',
    '    const [count, setCount] = React.useState(0)',
    "    return React.createElement('div', null, modules.reactJsx`<span id=\"react-jsx\">React JSX identity</span>`, React.createElement('button', { id: 'counter', onClick: () => setCount(count + 1) }, 'Count: ' + count))",
    '  }',
    "  createRoot(document.querySelector('#root')).render(React.createElement(Counter))",
    "  const transformed = modules.transformJsxSource('const answer: number = 42; const view = <div>{answer}</div>', { typescript: 'strip' })",
    "  const repeated = await loadStableCdn({ entries: ['core'] })",
    '  globalThis.__cdnSmokeResult = {',
    "    status: 'ok',",
    '    reactVersion: React.version,',
    "    dom: document.querySelector('#dom')?.textContent,",
    '    jsxIsReactElement: React.isValidElement(modules.reactJsx`<i />`),',
    "    mapHasReactDom: Boolean(map.imports['react-dom/client']),",
    '    importMapCount: document.querySelectorAll(\'script[type="importmap"]\').length,',
    '    countAfterPureMap,',
    '    initialImportMapCount,',
    '    repeatedCoreIsSameModule: repeated.jsx === modules.jsx,',
    '    transformed: { changed: transformed.changed, diagnostics: transformed.diagnostics, code: transformed.code },',
    '  }',
    '} catch (error) {',
    "  globalThis.__cdnSmokeResult = { status: 'error', error: error?.stack || String(error) }",
    '}',
  ].join('\n')

  await page.setContent(
    `<!doctype html><div id="root"></div><script type="module">${moduleSource}</script>`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.waitForFunction(
    () =>
      ['ok', 'error'].includes(
        (window as Window & { __cdnSmokeResult?: CdnSmokeResult }).__cdnSmokeResult
          ?.status ?? 'running',
      ),
    { timeout: 110_000 },
  )

  const result = await page.evaluate(
    () => (window as Window & { __cdnSmokeResult?: CdnSmokeResult }).__cdnSmokeResult,
  )
  expect(result).toMatchObject({
    status: 'ok',
    reactVersion: '19.3.1',
    dom: 'DOM parser ok',
    jsxIsReactElement: true,
    mapHasReactDom: true,
    importMapCount: 1,
    countAfterPureMap: 0,
    initialImportMapCount: 0,
    repeatedCoreIsSameModule: true,
    transformed: { changed: true, diagnostics: [] },
  })
  expect(result?.transformed?.code).not.toContain(': number')
  await expect(page.getByRole('button', { name: 'Count: 0' })).toBeVisible()
  await page.getByRole('button', { name: 'Count: 0' }).click()
  await expect(page.getByRole('button', { name: 'Count: 1' })).toBeVisible()
  await expect(page.locator('#react-jsx')).toHaveText('React JSX identity')
  expect(pageErrors).toEqual([])

  const providerRequests = requests.filter(request =>
    request.url.startsWith('https://ga.jspm.io/'),
  )
  for (const request of providerRequests) {
    expect(
      lockInstallUrls.some(installUrl => request.url.startsWith(installUrl)),
      `unlocked provider request: ${request.url}`,
    ).toBe(true)
    expect(request.resourceType).not.toBe('worker')
  }
  for (const asset of manifest.assets) {
    expect(providerRequests.some(request => request.url === asset.url)).toBe(true)
    expect(responses.get(asset.url)).toBe(200)
  }
})

test('host-owned bootstrap can inline the pure map before bare imports', async ({
  page,
}) => {
  await routeCandidatePackage(page)
  await page.goto('/')
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))

  const moduleSource = [
    "globalThis.__cdnSmokeResult = { status: 'running' }",
    'try {',
    `  const { getStableCdnImportMap } = await import(${JSON.stringify(stableCdnHelperUrl)})`,
    '  const before = document.querySelectorAll(\'script[type="importmap"]\').length',
    '  const map = await getStableCdnImportMap()',
    "  const importMap = document.createElement('script')",
    "  importMap.type = 'importmap'",
    '  importMap.textContent = JSON.stringify(map)',
    '  document.head.append(importMap)',
    '  await Promise.resolve()',
    "  const { jsx } = await import('@knighted/jsx')",
    '  document.body.append(jsx`<p id="host-map">Inline map resolved the bare import</p>`)',
    '  globalThis.__cdnSmokeResult = {',
    "    status: 'ok',",
    '    before,',
    '    after: document.querySelectorAll(\'script[type="importmap"]\').length,',
    "    text: document.querySelector('#host-map')?.textContent,",
    '  }',
    '} catch (error) {',
    "  globalThis.__cdnSmokeResult = { status: 'error', error: error?.stack || String(error) }",
    '}',
  ].join('\n')

  await page.setContent(`<!doctype html><script type="module">${moduleSource}</script>`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForFunction(
    () =>
      ['ok', 'error'].includes(
        (window as Window & { __cdnSmokeResult?: CdnSmokeResult }).__cdnSmokeResult
          ?.status ?? 'running',
      ),
    { timeout: 60_000 },
  )

  const result = await page.evaluate(
    () => (window as Window & { __cdnSmokeResult?: CdnSmokeResult }).__cdnSmokeResult,
  )
  expect(result).toMatchObject({ status: 'ok', before: 0, after: 1 })
  expect(result?.dom).toBeUndefined()
  expect(pageErrors).toEqual([])
  await expect(page.locator('#host-map')).toHaveText(
    'Inline map resolved the bare import',
  )
})
