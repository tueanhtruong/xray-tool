import { test, expect } from '@playwright/test'
import pg from 'pg'
import { control, setupRepository, signInWithOAuth } from './support'

async function queryRows<T extends pg.QueryResultRow>(query: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL_TEST })
  await client.connect()
  try {
    return (await client.query<T>(query, params)).rows
  } finally {
    await client.end()
  }
}

test('project picker closes on outside click and Escape', async ({ page, request }) => {
  await control(request, {
    mode: 'single',
    projectMode: 'valid',
    xrayMode: 'valid',
    xrayFolderMode: 'flat',
    xrayTestMode: 'five',
  })
  await signInWithOAuth(page)
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'EU', exact: true }).click()
  await page.getByLabel('Xray client ID').fill('mock-xray-client-id')
  await page.getByLabel('Xray client secret').fill('mock-xray-client-secret')
  await page.getByTestId('xray-test-save').click()
  await expect(page.getByTestId('xray-connection-status')).toContainText('Connected to Xray Cloud')
  await page.getByTestId('project-query').fill('ONEDS')
  await page.getByTestId('project-search').click()
  await page
    .getByTestId('project-results')
    .locator('li')
    .filter({ hasText: 'ONEDS' })
    .getByRole('button')
    .click()
  await page.getByTestId('repository-link').first().click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('pull-from-xray').click()
  await expect(page.getByTestId('pull-success')).toContainText('Pulled 5 tests, 4 folders')
  await page.getByRole('link', { name: 'ONEDS-14043' }).click()
  await expect(page).toHaveURL(/\/tests\/ONEDS-14043\?.*project=/)
  await expect(page.getByTestId('test-details')).toBeVisible()
  const projectId = new URL(page.url()).searchParams.get('project')
  expect(projectId).toBeTruthy()
  await page.getByTestId('back-to-repository').click()
  await expect(page).toHaveURL(new RegExp(`/repository\\?.*project=${projectId}`))

  const chooseProject = page.getByRole('button', { name: 'Choose Jira project' })
  const search = page.getByRole('combobox', { name: 'Search Jira projects' })

  await chooseProject.click()
  await expect(search).toBeVisible()
  await page.getByRole('heading', { name: 'Test repository' }).click()
  await expect(search).toBeHidden()

  await chooseProject.click()
  await expect(search).toBeVisible()
  await search.press('Escape')
  await expect(search).toBeHidden()
})

test('authorized projects have independent URL context, shared caches and private drafts', async ({
  page,
  request,
}) => {
  await setupRepository(page, request)
  await expect(page).toHaveURL(/project=/)
  const projectA = new URL(page.url()).searchParams.get('project')
  expect(projectA).toBeTruthy()
  await expect(page.getByTestId('pull-success')).toContainText('Pulled 5 tests, 4 folders')
  await expect(page.getByRole('button', { name: 'Refresh folders' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Refresh all project tests/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Refresh this folder/ })).toHaveCount(0)

  const session = (await page.evaluate(
    async () => await (await fetch('/api/auth/session')).json(),
  )) as { userId: string }
  const userId = session.userId
  const testCase = (
    await queryRows<{ id: string; projectId: string }>(
      'SELECT id,"projectId" FROM "TestCase" WHERE "projectId"=$1 ORDER BY key LIMIT 1',
      [projectA],
    )
  )[0]!
  await queryRows(
    `INSERT INTO "TestCaseDraft" (id,"userId","testCaseId",summary,"updatedAt") VALUES ('e2e-private-draft',$1,$2,'Private edit',now()) ON CONFLICT ("userId","testCaseId") DO UPDATE SET summary=EXCLUDED.summary`,
    [userId, testCase.id],
  )

  await page.getByRole('button', { name: 'Choose Jira project' }).click()
  await page.getByLabel('Search Jira projects').fill('DEMO')
  await page.getByLabel('Search Jira projects').press('Enter')
  await expect(page.getByRole('button', { name: /DEMO — Demo Project/ })).toBeVisible()
  await page.getByRole('button', { name: /DEMO — Demo Project/ }).click()
  const draftSwitchDialog = page.getByRole('dialog', { name: /Unsynced drafts in/ })
  await expect(draftSwitchDialog).toContainText('Review drafts')
  await expect(draftSwitchDialog).toContainText('Switch and keep drafts')
  await page.getByRole('button', { name: 'Review drafts' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${projectA}/drafts`))
  await expect(page.getByText('Private edit')).toBeVisible()

  await page.goto(`/repository?project=${projectA}`)
  await page.getByRole('button', { name: 'Choose Jira project' }).click()
  await page.getByLabel('Search Jira projects').fill('DEMO')
  await page.getByLabel('Search Jira projects').press('Enter')
  await page.getByRole('button', { name: /DEMO — Demo Project/ }).click()
  await page.getByRole('button', { name: 'Switch and keep drafts' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get('project')).not.toBe(projectA)

  const otherTab = await page.context().newPage()
  await otherTab.goto(`/repository?project=${projectA}`)
  await expect(otherTab).toHaveURL(new RegExp(`project=${projectA}`))
  await otherTab.close()

  const after = await queryRows<{ summary: string }>(
    `SELECT summary FROM "TestCaseDraft" WHERE id='e2e-private-draft'`,
  )
  expect(after).toEqual([{ summary: 'Private edit' }])
})
