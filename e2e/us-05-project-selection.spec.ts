import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import pg from 'pg'
import { mockServicesUrl } from '../tests/support/env'

async function control(request: APIRequestContext, body: Record<string, unknown>) {
  await request.post(new URL('/__control', mockServicesUrl()).toString(), { data: body })
}

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByTestId('jira-login').click()
  await expect(page).toHaveURL('/')
}

async function configureXray(page: Page) {
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'EU', exact: true }).click()
  await page.getByLabel('Xray client ID').fill('mock-xray-client-id')
  await page.getByLabel('Xray client secret').fill('mock-xray-client-secret')
  await page.getByTestId('xray-test-save').click()
  await expect(page.getByTestId('xray-connection-status')).toContainText('Connected to Xray Cloud')
}

async function selectResult(page: Page, key: string, confirmChange = false) {
  const row = page.getByTestId('project-results').locator('li').filter({ hasText: key })
  if (confirmChange) {
    page.once('dialog', async (dialog) => {
      expect(await dialog.type()).toBe('confirm')
      expect(await dialog.message()).toContain(`Change the selected project to ${key}?`)
      await dialog.accept()
    })
  }
  await row.getByRole('button').click()
}

async function queryRows<T extends pg.QueryResultRow>(query: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL_TEST })
  await client.connect()
  try {
    return (await client.query<T>(query, params)).rows
  } finally {
    await client.end()
  }
}

test('searches, validates, and selects a Jira/Xray project for the workspace', async ({
  page,
  request,
}) => {
  await control(request, { mode: 'single', projectMode: 'valid', xrayMode: 'valid' })
  await signIn(page)
  await configureXray(page)

  await expect(page.getByTestId('onboarding-checklist')).toContainText('Jira connected')
  await expect(page.getByTestId('onboarding-checklist')).toContainText('Xray connected')
  await page.getByTestId('project-query').fill('ONEDS')
  await page.getByTestId('project-search').click()
  await expect(page.getByTestId('project-results')).toContainText('ONEDS — One Design System')
  await selectResult(page, 'ONEDS')
  await expect(page.getByTestId('workspace-ready')).toHaveText('Ready')
  await expect(page.getByTestId('onboarding-checklist')).toContainText('Project selected: ONEDS')
})

test('shows Xray permission and missing Test issue type errors without replacing a ready project', async ({
  page,
  request,
}) => {
  await control(request, { mode: 'single', projectMode: 'valid', xrayMode: 'valid' })
  await signIn(page)
  await configureXray(page)
  await page.getByTestId('project-query').fill('ONEDS')
  await page.getByTestId('project-search').click()
  await selectResult(page, 'ONEDS')
  await expect(page.getByTestId('workspace-ready')).toBeVisible()

  await control(request, { xrayMode: 'project-denied' })
  await page.getByTestId('project-query').fill('ABC')
  await page.getByTestId('project-search').click()
  await selectResult(page, 'ABC', true)
  await expect(page.getByTestId('project-error')).toContainText('Xray cannot access project ABC')
  await expect(page.getByTestId('onboarding-checklist')).toContainText('Project selected: ONEDS')

  await control(request, { xrayMode: 'valid', projectMode: 'no-test' })
  await page.getByTestId('project-query').fill('ONEDS')
  await page.getByTestId('project-search').click()
  await selectResult(page, 'ONEDS')
  await expect(page.getByTestId('project-error')).toContainText(
    'Xray is not enabled for project ONEDS',
  )
  await expect(page.getByTestId('onboarding-checklist')).toContainText('Project selected: ONEDS')
  await control(request, { projectMode: 'valid', xrayMode: 'valid' })
})

test('requires confirmation to switch and blocks switching while persisted drafts exist', async ({
  page,
  request,
}) => {
  await control(request, { mode: 'single', projectMode: 'valid', xrayMode: 'valid' })
  await signIn(page)
  await configureXray(page)
  await page.getByTestId('project-query').fill('ONEDS')
  await page.getByTestId('project-search').click()
  await selectResult(page, 'ONEDS')
  await expect(page.getByTestId('workspace-ready')).toHaveText('Ready')

  const body = (await page.evaluate(
    async () => await (await fetch('/api/auth/session')).json(),
  )) as {
    workspace?: { id: string }
  }
  const workspaceId = body.workspace?.id
  expect(workspaceId).toBeTruthy()
  const testCaseId = `us05-draft-${Date.now()}`
  const draftId = `us05-pending-${Date.now()}`
  try {
    await queryRows(
      'INSERT INTO "TestCase" (id, "workspaceId", "jiraProjectId", "issueId", key, "testType", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())',
      [testCaseId, workspaceId, '10001', `${testCaseId}-issue`, `${testCaseId}-key`, 'Cucumber'],
    )
    await queryRows(
      'INSERT INTO "TestCaseDraft" (id, "testCaseId", summary, "updatedAt") VALUES ($1, $2, $3, now())',
      [draftId, testCaseId, 'Pending local change'],
    )

    await page.getByTestId('project-query').fill('DEMO')
    await page.getByTestId('project-search').click()
    await selectResult(page, 'DEMO', true)
    await expect(page.getByTestId('project-error')).toContainText(
      'Sync or discard unsynced drafts before changing projects.',
    )
    await expect(page.getByTestId('onboarding-checklist')).toContainText('Project selected: ONEDS')
    await expect(page.getByTestId('workspace-ready')).toHaveText('Ready')
  } finally {
    await queryRows('DELETE FROM "TestCaseDraft" WHERE id = $1', [draftId])
    await queryRows('DELETE FROM "TestCase" WHERE id = $1', [testCaseId])
  }
})
