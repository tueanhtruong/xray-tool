import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { APIRequestContext, Page } from '@playwright/test'
import { mockServicesUrl } from '../tests/support/env'

async function control(request: APIRequestContext, body: Record<string, unknown>) {
  await request.post(new URL('/__control', mockServicesUrl()).toString(), { data: body })
}

async function setup(page: Page, request: APIRequestContext) {
  await control(request, { xrayMode: 'valid', xrayFolderMode: 'flat', xrayTestMode: 'five', xrayTestFailureStart: -1, resetXrayCounts: true })
  await page.goto('/login')
  await page.getByTestId('jira-login').click()
  await expect(page).toHaveURL('/')
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'EU', exact: true }).click()
  await page.getByLabel('Xray client ID').fill('mock-xray-client-id')
  await page.getByLabel('Xray client secret').fill('mock-xray-client-secret')
  await page.getByTestId('xray-test-save').click()
  await expect(page.getByTestId('xray-connection-status')).toBeVisible()
  await page.getByTestId('project-query').fill('ONEDS')
  await page.getByTestId('project-search').click()
  await page.getByTestId('project-results').locator('li').filter({ hasText: 'ONEDS' }).getByRole('button').click()
  await page.getByTestId('repository-link').click()
  await page.getByTestId('pull-from-xray').click()
  await expect(page.getByTestId('pull-success')).toContainText('Pulled 5 tests, 4 folders')
}

test('browses, searches, deep-links, and selects tests for editor work', async ({ page, request }) => {
  await setup(page, request)
  await page.getByRole('button', { name: /Autocomplete \(3\)/ }).click()
  await expect(page).toHaveURL(/folder=\/Autocomplete/)
  await expect(page.getByRole('table')).toContainText('ONEDS-14043')
  await expect(page.getByRole('table')).not.toContainText('ONEDS-14044')
  await page.getByRole('checkbox', { name: 'Include subfolders' }).check()
  await expect(page.getByRole('table')).toContainText('ONEDS-14044')
  await page.getByLabel('Search tests').fill('ONEDS-14043')
  await expect(page.getByRole('table')).toContainText('ONEDS-14043')
  await expect(page.getByRole('table')).not.toContainText('ONEDS-14044')
  await page.reload()
  await expect(page.getByLabel('Search tests')).toHaveValue('ONEDS-14043')
  await page.getByLabel('Search tests').fill('')
  await page.getByRole('checkbox', { name: 'Select ONEDS-14045' }).check()
  await page.getByTestId('open-selected').click()
  await expect(page).toHaveURL(/editor\?ids=/)
  const counts = await (await request.get(new URL('/__control', mockServicesUrl()).toString())).json() as { xrayDetailQueryCount: number }
  expect(counts.xrayDetailQueryCount).toBe(1)
})

test('shows escaped remote content in the read-only detail view', async ({ page, request }) => {
  await setup(page, request)
  await page.getByRole('button', { name: 'ONEDS-14045' }).click()
  await expect(page.getByRole('dialog')).toContainText('<img src=x onerror=alert(1)>')
  await expect(page.getByRole('dialog')).toContainText('Labels: need-review, ui')
  await expect(page.getByRole('dialog')).toContainText('Status: Ready')
  await expect(page.getByRole('dialog').locator('img')).toHaveCount(0)
  const link = page.getByRole('link', { name: 'Open in Jira' })
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'ONEDS-14045' }).click()
  await expect(page.getByRole('dialog')).toContainText('<img src=x onerror=alert(1)>')
  const counts = await (await request.get(new URL('/__control', mockServicesUrl()).toString())).json() as { xrayDetailQueryCount: number }
  expect(counts.xrayDetailQueryCount).toBe(2)
})

test('shows only key, name and folder until a test is opened', async ({ page, request }) => {
  await setup(page, request)
  const table = page.getByRole('table')
  await expect(table.locator('thead')).toContainText('Key')
  await expect(table.locator('thead')).toContainText('Name')
  await expect(table.locator('thead')).toContainText('Folder')
  await expect(table.locator('thead')).not.toContainText('Labels')
  await expect(table.locator('thead')).not.toContainText('Status')
  await expect(table.locator('thead')).not.toContainText('Type')
  await expect(table).toContainText('Repository test 1')
})

test('has no serious or critical accessibility violations', async ({ page, request }) => {
  await setup(page, request)
  const results = await new AxeBuilder({ page }).include('[data-testid="repository"]').analyze()
  const serious = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
  expect(serious.map(({ id, impact, description, nodes }) => ({
    id,
    impact,
    description,
    nodes: nodes.map((node) => ({ target: node.target, summary: node.failureSummary, html: node.html })),
  })), JSON.stringify(serious, null, 2)).toEqual([])
})
