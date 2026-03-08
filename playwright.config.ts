import { defineConfig } from '@playwright/test'
import type { PlaywrightTestProject } from '@playwright/test'

const HOST = process.env.PLAYWRIGHT_HOST ?? '127.0.0.1'
const ESM_DEMO_PORT = Number(process.env.ESM_DEMO_PORT ?? 4173)
const LOADER_FIXTURE_PORT = Number(process.env.LOADER_FIXTURE_PORT ?? 4174)
const esmDemoUrl = process.env.ESM_DEMO_URL ?? `http://${HOST}:${ESM_DEMO_PORT}`
const projects: PlaywrightTestProject[] = [
  {
    name: 'chrome',
    use: { channel: 'chrome' },
  },
]

if (process.env.CI) {
  projects.push({
    name: 'safari',
    use: { browserName: 'webkit' },
  })
}

export default defineConfig({
  testDir: './playwright',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: esmDemoUrl,
    trace: 'on-first-retry',
    headless: true,
  },
  projects,
  webServer: [
    {
      command: `npx serve . -l ${ESM_DEMO_PORT}`,
      url: `http://${HOST}:${ESM_DEMO_PORT}/test/fixtures/e2e.html`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: `npx serve test/fixtures/rspack-app -l ${LOADER_FIXTURE_PORT}`,
      url: `http://${HOST}:${LOADER_FIXTURE_PORT}/index.html`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
})
