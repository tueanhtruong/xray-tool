import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { connectXrayAndSelectProject, control, mockState, signInWithOAuth } from './support'

async function setup(page: Page, request: APIRequestContext) {
  await control(request, {
    xrayMode: 'valid',
    xrayFolderMode: 'flat',
    xrayTestMode: 'five',
    xrayTestFailureStart: -1,
    resetXrayCounts: true,
  })
  await signInWithOAuth(page)
  await connectXrayAndSelectProject(page)
  await expect(page.getByTestId('repository-link')).toBeVisible()
}

const detailCount = async (request: APIRequestContext) =>
  (await mockState<{ xrayDetailQueryCount: number }>(request)).xrayDetailQueryCount

test('pulls a lightweight index and reports completion without loading full details', async ({
  page,
  request,
}) => {
  await setup(page, request)
  await page.getByTestId('repository-link').click()
  await expect(page).toHaveURL('/repository')
  await page.getByTestId('pull-from-xray').click()
  await expect(page.getByTestId('pull-success')).toContainText('Pulled 5 tests, 4 folders')
  await expect(page.getByRole('table')).toContainText('ONEDS-14043')
  await expect(page.getByRole('table').locator('thead')).toContainText('Summary')
  await expect(page.getByRole('table').locator('thead')).not.toContainText('Type')
  expect(await detailCount(request)).toBe(0)

  await page.getByRole('link', { name: 'ONEDS-14044' }).click()
  await expect(page).toHaveURL('/tests/ONEDS-14044')
  await expect(page.getByTestId('test-gherkin')).toContainText('Scenario Outline: Search')
  await expect(page.getByTestId('test-type')).toContainText('Cucumber')
  expect(await detailCount(request)).toBe(1)
  await page.getByTestId('back-to-repository').click()

  await page.getByRole('checkbox', { name: 'Select ONEDS-14046' }).check()
  await page.getByTestId('open-selected').click()
  await expect(page).toHaveURL('/tests/ONEDS-14046')
  await expect(page.getByTestId('test-key')).toHaveText('ONEDS-14046')
  // One more for the editor-selection call and one for the test page's own fresh fetch.
  expect(await detailCount(request)).toBe(3)
})
