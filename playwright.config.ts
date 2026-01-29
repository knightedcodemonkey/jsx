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
  use: {
    baseURL: esmDemoUrl,
    trace: 'on-first-retry',
    headless: true,
  },
  projects,
  webServer: [
    {
      command: `npx http-server . -p ${ESM_DEMO_PORT} -a ${HOST} --silent`,
      url: `http://${HOST}:${ESM_DEMO_PORT}/test/fixtures/e2e.html`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: `npx http-server test/fixtures/rspack-app -p ${LOADER_FIXTURE_PORT} -a ${HOST} --silent`,
      url: `http://${HOST}:${LOADER_FIXTURE_PORT}/index.html`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
})
