import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { mockServicesUrl } from '../tests/support/env'
import { signInWithOAuth } from './support'

async function control(request: APIRequestContext, body: Record<string, unknown>) {
  await request.post(new URL('/__control', mockServicesUrl()).toString(), { data: body })
}

const signIn = signInWithOAuth

async function configureAndSelectProject(page: Page) {
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'EU', exact: true }).click()
  await page.getByLabel('Xray client ID').fill('mock-xray-client-id')
  await page.getByLabel('Xray client secret').fill('mock-xray-client-secret')
  await page.getByTestId('xray-test-save').click()
  await expect(page.getByTestId('xray-connection-status')).toBeVisible()
  await page.getByTestId('project-query').fill('ONEDS')
  await page.getByTestId('project-search').click()
  const row = page.getByTestId('project-results').locator('li').filter({ hasText: 'ONEDS' })
  await row.getByRole('button').click()
  await expect(page.getByTestId('workspace-ready')).toBeVisible()
}

test('pulls the nested Xray folder tree into the local cache', async ({ page, request }) => {
  await control(request, { xrayMode: 'valid', xrayFolderMode: 'flat', xrayFolderFailurePath: '' })
  await signIn(page)
  await configureAndSelectProject(page)
  await page.getByTestId('pull-folders').getByRole('button', { name: 'Pull folders' }).click()
  await expect(page.getByTestId('pull-result')).toContainText('Pulled 4 folders')
  const body = await page.evaluate(async () => await (await fetch('/api/folders')).json()) as { folders: Array<{ path: string; folders: Array<{ path: string }> }> }
  expect(body.folders.map((folder) => folder.path)).toEqual(['/Autocomplete', '/Billing', '/Search'])
  expect(body.folders[0]?.folders[0]?.path).toBe('/Autocomplete/Focus')
  await page.getByTestId('repository-link').click()
  const folderTree = page.getByRole('navigation', { name: 'Test folders' })
  const autocomplete = folderTree.getByRole('treeitem', { name: /^Autocomplete/ })
  await expect(autocomplete).toHaveAttribute('aria-expanded', 'false')
  await autocomplete.focus()
  await page.keyboard.press('ArrowRight')
  await expect(autocomplete).toHaveAttribute('aria-expanded', 'true')
  await expect(folderTree.getByRole('treeitem', { name: /^Focus/ })).toBeVisible()
})
