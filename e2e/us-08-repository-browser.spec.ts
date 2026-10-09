import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockState, setupRepository } from './support'

test('shows inclusive folder counts while descendants are collapsed', async ({ page, request }) => {
  await setupRepository(page, request)
  const parent = page.locator('[data-path="/Autocomplete"]')
  await expect(parent).toHaveAttribute('aria-expanded', 'false')
  await expect(parent).toContainText('Autocomplete')
  await expect(parent).toContainText(/3\s*\(4\)/)
  const disclosure = parent.getByTestId('folder-disclosure')
  await expect(disclosure).toHaveClass(/i-lucide:chevron-right/)
  await parent.focus()
  await parent.press('ArrowRight')
  await expect(parent).toHaveAttribute('aria-expanded', 'true')
  await expect(disclosure).toHaveClass(/i-lucide:chevron-down/)
  await expect(parent).toContainText(/3\s*\(4\)/)
  const leaf = page.locator('[data-path="/Billing"]')
  await expect(leaf).toContainText('Billing')
  await expect(leaf).toContainText('2')
  await expect(leaf).not.toContainText('(2)')
  await expect(leaf.getByTestId('folder-disclosure')).toHaveCount(0)
})

test('resizes the folder sidebar by pointer and keyboard within bounds', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await setupRepository(page, request)
  const sidebar = page.getByTestId('repository').locator('aside')
  const separator = page.getByRole('separator', { name: 'Resize folder sidebar' })
  await expect(separator).toBeVisible()
  await expect(separator).toHaveAttribute('aria-orientation', 'vertical')
  await expect(separator).toHaveAttribute('aria-valuemin', '150')
  await expect(separator).toHaveAttribute('aria-valuemax', '500')
  await expect(separator).toHaveAttribute('aria-valuenow', '260')
  await expect(sidebar).toHaveCSS('width', '260px')

  await separator.focus()
  await page.keyboard.press('ArrowRight')
  await expect(separator).toHaveAttribute('aria-valuenow', '276')
  await page.keyboard.press('ArrowLeft')
  await expect(separator).toHaveAttribute('aria-valuenow', '260')

  let handle = await separator.boundingBox()
  if (!handle) throw new Error('Sidebar separator is not visible')
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 20)
  await page.mouse.down()
  await page.mouse.move(0, handle.y + 20)
  await page.mouse.up()
  await expect(separator).toHaveAttribute('aria-valuenow', '150')
  await expect(sidebar).toHaveCSS('width', '150px')

  handle = await separator.boundingBox()
  if (!handle) throw new Error('Sidebar separator is not visible')
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 20)
  await page.mouse.down()
  await page.mouse.move(1000, handle.y + 20)
  await page.mouse.up()
  await expect(separator).toHaveAttribute('aria-valuenow', '500')
  await expect(sidebar).toHaveCSS('width', '500px')
  const sidebarBox = await sidebar.boundingBox()
  const mainBox = await page.locator('[data-testid="repository"] > div').boundingBox()
  if (!sidebarBox || !mainBox) throw new Error('Repository columns are not visible')
  expect(mainBox.x).toBeGreaterThanOrEqual(sidebarBox.x + sidebarBox.width)

  await page.setViewportSize({ width: 799, height: 800 })
  await expect(separator).toBeHidden()
})

test('browses, searches, deep-links, and selects tests for editor work', async ({
  page,
  request,
}) => {
  await setupRepository(page, request)
  await page.getByRole('treeitem', { name: /^Autocomplete/ }).click()
  await expect(page).toHaveURL(/folder=\/Autocomplete/)
  await expect(page.getByRole('table')).toContainText('ONEDS-14043')
  await expect(page.getByRole('textbox', { name: 'Summary for ONEDS-14043' })).toHaveValue('Repository test 1')
  await expect(page.getByRole('combobox', { name: 'Status for ONEDS-14043' })).toHaveValue('Ready')
  await expect(page.getByRole('table')).not.toContainText('ONEDS-14044')
  await page.getByRole('checkbox', { name: 'Include subfolders' }).check()
  await expect(page.getByRole('table')).toContainText('ONEDS-14044')
  await page.getByLabel('Search tests').fill('ONEDS-14043')
  await expect(page).toHaveURL(/q=ONEDS-14043/)
  await expect(page.getByRole('table')).toContainText('ONEDS-14043')
  await expect(page.getByRole('table')).not.toContainText('ONEDS-14044')
  await page.reload()
  await expect(page.getByLabel('Search tests')).toHaveValue('ONEDS-14043')
  await expect(page.getByRole('table')).toContainText('ONEDS-14043')
  await page.getByLabel('Search tests').fill('')
  await expect(page).not.toHaveURL(/q=/)
  await page.getByRole('checkbox', { name: 'Select ONEDS-14045' }).check()
  await expect(page.getByTestId('open-selected')).toBeEnabled()
  await page.getByTestId('open-selected').click()
  await expect(page).toHaveURL(/\/tests\/ONEDS-14045/)
  expect(
    (await mockState<{ xrayDetailQueryCount: number }>(request)).xrayDetailQueryCount,
  ).toBeGreaterThanOrEqual(1)
})

test('shows escaped remote content in the read-only test page', async ({ page, request }) => {
  await setupRepository(page, request)
  const detailsResponse = page.waitForResponse((response) => response.url().includes('/api/tests/by-key/'))
  await page.getByRole('link', { name: 'ONEDS-14045' }).click()
  expect((await detailsResponse).status()).toBe(200)
  await expect(page.getByTestId('test-type')).toContainText('Cucumber')
  await expect(page.getByTestId('test-details')).toBeVisible()
  await expect(page.getByTestId('test-details')).toContainText('<img src=x onerror=alert(1)>')
  await expect(page.getByTestId('test-labels')).toContainText('need-review')
  await expect(page.getByTestId('test-labels')).toContainText('ui')
  await expect(page.getByTestId('test-status')).toHaveText('Ready')
  await expect(page.locator('main img')).toHaveCount(0)
  const link = page.getByRole('link', { name: 'Open in Jira' })
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.locator('main input, main textarea, main select')).toHaveCount(0)
})

test('shows editable columns after bounded detail hydration', async ({ page, request }) => {
  await setupRepository(page, request)
  const table = page.getByRole('table')
  await expect(table.locator('thead')).toContainText('Key')
  await expect(table.locator('thead')).toContainText('Summary')
  await expect(table.locator('thead')).toContainText('Folder')
  await expect(table.locator('thead')).toContainText('Labels')
  await expect(table.locator('thead')).toContainText('Status')
  await expect(table).toContainText('ONEDS-14043')
})

test('has no serious or critical accessibility violations', async ({ page, request }) => {
  await setupRepository(page, request)
  const results = await new AxeBuilder({ page }).include('[data-testid="repository"]').analyze()
  const serious = results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  )
  expect(
    serious.map(({ id, impact, description, nodes }) => ({
      id,
      impact,
      description,
      nodes: nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
        html: node.html,
      })),
    })),
    JSON.stringify(serious, null, 2),
  ).toEqual([])
})
