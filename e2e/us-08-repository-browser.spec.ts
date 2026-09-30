import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockState, setupRepository } from './support'

test('browses, searches, deep-links, and selects tests for editor work', async ({ page, request }) => {
  await setupRepository(page, request)
  await page.getByRole('treeitem', { name: /^Autocomplete/ }).click()
  await expect(page).toHaveURL(/folder=\/Autocomplete/)
  await expect(page.getByRole('table')).toContainText('ONEDS-14043')
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
  expect((await mockState<{ xrayDetailQueryCount: number }>(request)).xrayDetailQueryCount).toBeGreaterThanOrEqual(1)
})

test('shows escaped remote content in the read-only test page', async ({ page, request }) => {
  await setupRepository(page, request)
  await page.getByRole('link', { name: 'ONEDS-14045' }).click()
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

test('shows only key, summary and folder until a test is opened', async ({ page, request }) => {
  await setupRepository(page, request)
  const table = page.getByRole('table')
  await expect(table.locator('thead')).toContainText('Key')
  await expect(table.locator('thead')).toContainText('Summary')
  await expect(table.locator('thead')).toContainText('Folder')
  await expect(table.locator('thead')).not.toContainText('Labels')
  await expect(table.locator('thead')).not.toContainText('Status')
  await expect(table.locator('thead')).not.toContainText('Type')
  await expect(table).toContainText('Repository test 1')
})

test('has no serious or critical accessibility violations', async ({ page, request }) => {
  await setupRepository(page, request)
  const results = await new AxeBuilder({ page }).include('[data-testid="repository"]').analyze()
  const serious = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
  expect(serious.map(({ id, impact, description, nodes }) => ({
    id,
    impact,
    description,
    nodes: nodes.map((node) => ({ target: node.target, summary: node.failureSummary, html: node.html })),
  })), JSON.stringify(serious, null, 2)).toEqual([])
})
