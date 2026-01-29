import { test, expect } from '@playwright/test'

const hybridSelectors = {
  reactRuntimeButton: '#react-runtime-demo .react-panel button',
  reactRuntimeCounter: '#react-runtime-demo .react-panel p',
  litHost: 'lit-hosts-react',
  litReactBadge: 'lit-hosts-react .hybrid-react-badge',
  liteMetrics: '#lite-entrypaths .lite-metric',
}

const overviewSelectors = {
  card: '.overview-card',
  capabilityItems: '.overview-card .capability-item',
}

/**
 * Tests the local E2E fixture to ensure that the current build works as expected.
 */
test.describe('esm demo via local dist fixture', () => {
  test('renders nested DOM trees and increments counter', async ({ page }) => {
    await page.goto('/test/fixtures/e2e.html')

    const counterButton = page.locator('.counter-button')
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
})
