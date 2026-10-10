import { expect, test } from '@playwright/test'
import { control, setupRepository, writeRequestCount } from './support'

test('grid shows only the final columns and Edit all is disabled without selection', async ({
  page,
  request,
}) => {
  await setupRepository(page, request)
  const header = page.getByRole('table').locator('thead')
  for (const name of ['Key', 'Summary', 'Folder', 'Gherkin', 'Draft'])
    await expect(header).toContainText(name)
  await expect(header).not.toContainText('Labels')
  await expect(header).not.toContainText('Status')
  await expect(page.getByTestId('edit-all')).toBeDisabled()
})

test('edit all opens the compare screen for exactly the selected tests', async ({
  page,
  request,
}) => {
  await setupRepository(page, request)
  await page.getByRole('checkbox', { name: 'Select ONEDS-14043' }).check()
  await page.getByRole('checkbox', { name: 'Select ONEDS-14045' }).check()
  await expect(page.getByTestId('edit-all')).toHaveText('Edit all (2)')
  await page.getByTestId('edit-all').click()
  await expect(page).toHaveURL(/\/tests\/edit\?project=/)
  await expect(page.getByTestId('edit-rail').getByRole('button')).toHaveCount(2)
  await expect(page.getByTestId('rail-ONEDS-14043')).toBeVisible()
  await expect(page.getByTestId('rail-ONEDS-14045')).toBeVisible()
  await expect(page.getByTestId('edit-position')).toHaveText('1 / 2')
})

test('summary edits autosave as drafts with no remote writes and survive reload', async ({
  page,
  request,
}) => {
  await setupRepository(page, request)
  await page.getByRole('checkbox', { name: 'Select ONEDS-14043' }).check()
  await page.getByTestId('edit-all').click()
  await expect(page.getByTestId('edit-summary')).toHaveValue('Repository test 1')
  await page.getByTestId('edit-summary').fill('Edited summary')
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
  await expect(page.getByTestId('rail-ONEDS-14043')).toContainText('•')
  expect(await writeRequestCount(request)).toBe(0)
  await page.reload()
  await expect(page.getByTestId('edit-rail').getByRole('button')).toHaveCount(1)
  await expect(page.getByTestId('edit-summary')).toHaveValue('Edited summary')
})

test('gherkin edits show the diff and revert test removes the draft', async ({ page, request }) => {
  await setupRepository(page, request)
  await page.getByRole('checkbox', { name: 'Select ONEDS-14043' }).check()
  await page.getByTestId('edit-all').click()
  await expect(page.getByTestId('gherkin-compare')).toBeVisible()
  const draft = page.getByTestId('gherkin-compare').locator('.cm-content').last()
  await draft.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\n  Then the draft is edited')
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
  await expect(page.getByTestId('gherkin-compare').locator('.cm-changedLine').first()).toBeVisible()
  await page.getByTestId('revert-test').click()
  await expect(page.getByTestId('edit-summary')).toHaveValue('Repository test 1')
  await expect(page.getByTestId('rail-ONEDS-14043')).not.toContainText('•')
  expect(await writeRequestCount(request)).toBe(0)
})

test('a new tab without a selection redirects to the repository with a notice', async ({
  page,
  request,
}) => {
  await setupRepository(page, request)
  const repositoryUrl = page.url()
  const project = new URL(repositoryUrl).searchParams.get('project')
  const fresh = await page.context().newPage()
  await control(request, { resetXrayCounts: true })
  await fresh.goto(`/tests/edit?project=${project}`)
  await expect(fresh).toHaveURL(/\/repository\?.*notice=edit-no-selection/)
  await expect(fresh.getByRole('status').filter({ hasText: 'Edit all' })).toBeVisible()
  await fresh.close()
})

test('back to repository opens the folder of the selected test', async ({ page, request }) => {
  await setupRepository(page, request)
  await page.getByRole('checkbox', { name: 'Select ONEDS-14043' }).check()
  await page.getByTestId('edit-all').click()
  await expect(page.getByTestId('edit-summary')).toHaveValue('Repository test 1')
  await page.getByTestId('back-to-repository').click()
  await expect(page).toHaveURL(/\/repository\?.*folder=(%2F|\/)Autocomplete/)
})

test('the draft pane shows and accepts input on a long unchanged Gherkin', async ({
  page,
  request,
}) => {
  await setupRepository(page, request)
  const longGherkin = [
    'Feature: long',
    '  Scenario: long',
    ...Array.from({ length: 40 }, (_, i) => `    Given step ${i}`),
  ].join('\n')
  await page.route('**/api/tests/selection**', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as { values: Array<Record<string, unknown>> }
    for (const value of body.values) {
      value.gherkin = longGherkin
      value.fields = { ...(value.fields as object), gherkin: longGherkin }
      value.base = { ...(value.base as object), gherkin: longGherkin }
    }
    await route.fulfill({ response, json: body })
  })
  await page.getByRole('checkbox', { name: 'Select ONEDS-14043' }).check()
  await page.getByTestId('edit-all').click()
  const draft = page.getByTestId('gherkin-compare').locator('.cm-content').last()
  await expect(draft).toBeVisible()
  await expect(draft).toContainText('Given step 0')
  await expect(page.getByTestId('gherkin-compare')).not.toContainText('unchanged lines')
  await draft.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\n    Then the draft is edited')
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
})
