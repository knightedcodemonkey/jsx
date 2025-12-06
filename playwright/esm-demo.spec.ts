import { test, expect } from '@playwright/test'

const deepTreeSelectors = {
  section: '#deep-demo',
  groups: '#deep-demo .feature-group',
}

const hybridSelectors = {
  reactRuntimeButton: '#react-runtime-demo .react-panel button',
  reactRuntimeCounter: '#react-runtime-demo .react-panel p',
  litHost: 'lit-hosts-react',
  litReactBadge: 'lit-hosts-react .hybrid-react-badge',
  liteSavings: '.lite-savings-list li',
}

test.describe('esm demo via esm.sh', () => {
  test('renders nested DOM trees and increments counter', async ({ page }) => {
    await page.goto('/esm-demo.html')

    const counterButton = page.locator('.counter-button')
    const counterLabel = page.locator('.counter-value')

    await expect(counterLabel).toHaveText('0')
    await counterButton.click()
    await expect(counterLabel).toHaveText('1')
    await counterButton.click()
    await expect(counterLabel).toHaveText('2')

    const deepTreeSection = page.locator(deepTreeSelectors.section)
    await expect(deepTreeSection).toBeVisible()
    const deepTreeGroups = page.locator(deepTreeSelectors.groups)
    await expect(deepTreeGroups).toHaveCount(3)
    for (let index = 0; index < 3; index += 1) {
      await expect(
        page.locator(`${deepTreeSelectors.groups}:nth-child(${index + 1}) .feature-row`),
      ).toHaveCount(3)
    }
  })

  test('bridges lite tree with React + Lit hybrid widget', async ({ page }) => {
    await page.goto('/esm-demo.html')

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
    await expect(page.locator(hybridSelectors.liteSavings)).toHaveCount(3)
  })
})
