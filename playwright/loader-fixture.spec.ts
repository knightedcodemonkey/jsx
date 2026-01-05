import { test, expect } from '@playwright/test'

const loaderBaseUrl = process.env.LOADER_FIXTURE_URL ?? 'http://127.0.0.1:4174'

const selectors = {
  hybridHost: 'hybrid-element',
  hybridReactTreeGroup: 'hybrid-element .react-tree-group',
  hybridReactTreeAside: 'hybrid-element .react-tree-aside',
  hybridReactBadge: 'hybrid-element .react-badge',
  hybridNestedSlot: 'hybrid-element .nested-list',
  hybridNestedItem: 'hybrid-element .nested-list li',
  litParagraph: 'hybrid-element p[data-kind="lit"]',
  reactModeHost: 'react-mode-element',
  reactModeLitParagraph: 'react-mode-element p[data-kind="lit"]',
  reactModeButton: 'react-mode-element button[type="button"]',
  reactModeHeading: 'react-mode-element .react-only-card__title-highlight',
  reactModeAside: 'react-mode-element .react-only-card__title-note',
}

test.describe('loader rspack fixture', () => {
  test('hybrid build renders Lit + React siblings', async ({ page }) => {
    await page.goto(`${loaderBaseUrl}/index.html`)

    const hybridHost = page.locator(selectors.hybridHost)
    await expect(hybridHost).toBeVisible()

    await expect(page.locator(selectors.hybridReactBadge)).toHaveCount(1)
    await expect(page.locator(selectors.hybridReactTreeGroup)).toHaveCount(1)
    await expect(page.locator(selectors.hybridReactTreeAside)).toHaveCount(1)
    await expect(page.locator(selectors.hybridNestedSlot)).toBeVisible()
    await expect(page.locator(selectors.hybridNestedItem)).toHaveCount(1)
    await expect(page.locator(selectors.hybridNestedItem)).toContainText('Hybrid ready')

    const litParagraph = page.locator(selectors.litParagraph)
    await expect(litParagraph).toHaveText(/Works with Lit \+ React/)
  })

  test('react mode bundle updates nested heading and counter', async ({ page }) => {
    await page.goto(`${loaderBaseUrl}/index.html`)

    const reactModeHost = page.locator(selectors.reactModeHost)
    await expect(reactModeHost).toBeVisible()

    const litParagraph = page.locator(selectors.reactModeLitParagraph)
    await expect(litParagraph).toHaveText(/Lit host keeps working/)

    const headerHighlight = page.locator(selectors.reactModeHeading)
    await expect(headerHighlight).toContainText('React mode ready')

    const siblingNote = page.locator(selectors.reactModeAside)
    await expect(siblingNote).toContainText('Sibling annotation')

    const reactButton = page.locator(selectors.reactModeButton)
    await expect(reactButton).toHaveText(/Clicked 0 times/)
    await reactButton.click()
    await expect(reactButton).toHaveText(/Clicked 1 times/)
  })
})
