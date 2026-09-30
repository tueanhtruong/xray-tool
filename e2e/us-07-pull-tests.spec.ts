import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { mockServicesUrl } from '../tests/support/env'

async function control(request: APIRequestContext, body: Record<string, unknown>) {
  await request.post(new URL('/__control', mockServicesUrl()).toString(), { data: body })
}

async function setup(page: Page, request: APIRequestContext) {
  await control(request, { xrayMode: 'valid', xrayFolderMode: 'flat', xrayTestMode: 'five', xrayTestFailureStart: -1 })
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
  await expect(page.getByTestId('repository-link')).toBeVisible()
}

test('pulls a lightweight index and reports completion without loading full details', async ({ page, request }) => {
  await setup(page, request)
  await page.getByTestId('repository-link').click()
  await expect(page).toHaveURL('/repository')
  await page.getByTestId('pull-from-xray').click()
  await expect(page.getByTestId('pull-success')).toContainText('Pulled 5 tests, 4 folders')
  await expect(page.getByRole('table')).toContainText('ONEDS-14043')
  await expect(page.getByRole('table').locator('thead')).toContainText('Name')
  await expect(page.getByRole('table').locator('thead')).not.toContainText('Type')
  let counts = await (await request.get(new URL('/__control', mockServicesUrl()).toString())).json() as { xrayDetailQueryCount: number }
  expect(counts.xrayDetailQueryCount).toBe(0)
  await page.getByRole('button', { name: 'ONEDS-14044' }).click()
  await expect(page.getByRole('dialog')).toContainText('Scenario Outline: Search')
  await expect(page.getByRole('dialog')).toContainText('Labels: api')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('checkbox', { name: 'Select ONEDS-14046' }).check()
  await page.getByTestId('open-selected').click()
  await expect(page).toHaveURL(/editor\?ids=/)
  counts = await (await request.get(new URL('/__control', mockServicesUrl()).toString())).json() as { xrayDetailQueryCount: number }
  expect(counts.xrayDetailQueryCount).toBe(2)
})
