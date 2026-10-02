import { expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { mockServicesUrl } from '../../tests/support/env'

export async function control(request: APIRequestContext, body: Record<string, unknown>) {
  await request.post(new URL('/__control', mockServicesUrl()).toString(), { data: body })
}

export async function mockState<T = Record<string, number | string>>(request: APIRequestContext): Promise<T> {
  return (await (await request.get(new URL('/__control', mockServicesUrl()).toString())).json()) as T
}

/** Number of requests the mock has seen that would modify remote Jira/Xray data. */
export async function writeRequestCount(request: APIRequestContext): Promise<number> {
  return (await mockState<{ writeRequestCount: number }>(request)).writeRequestCount
}

/**
 * Signs in through the mock Atlassian OAuth flow. With no `next`, the landing spot is
 * /repository or /settings depending on whether the (shared) workspace is already ready, so this
 * then opens /settings for a deterministic start.
 */
export async function signInWithOAuth(page: Page, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  await page.getByTestId('jira-login').click()
  if (next) return
  await expect(page).toHaveURL(/\/(settings|repository)(\?|$)/)
  await page.goto('/settings')
  await expect(page).toHaveURL('/settings')
}

/** Opens the header user menu and signs out. */
export async function signOut(page: Page) {
  await page.getByTestId('user-menu').click()
  await page.getByTestId('logout').click()
}

/** Connects Xray (mock credentials) and selects project ONEDS from /settings. */
export async function connectXrayAndSelectProject(page: Page) {
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'EU', exact: true }).click()
  await page.getByLabel('Xray client ID').fill('mock-xray-client-id')
  await page.getByLabel('Xray client secret').fill('mock-xray-client-secret')
  await page.getByTestId('xray-test-save').click()
  await expect(page.getByTestId('xray-connection-status')).toBeVisible()
  await page.getByTestId('project-query').fill('ONEDS')
  await page.getByTestId('project-search').click()
  await page
    .getByTestId('project-results')
    .locator('li')
    .filter({ hasText: 'ONEDS' })
    .getByRole('button')
    .click()
  await expect(page).toHaveURL(/project=/)
}

/** Full setup used by repository specs: sign in, connect, open the repository, pull. */
export async function setupRepository(
  page: Page,
  request: APIRequestContext,
  options: { xrayTestMode?: string; xrayFolderMode?: string } = {},
) {
  await control(request, {
    mode: 'single',
    projectMode: 'valid',
    xrayMode: 'valid',
    xrayFolderMode: options.xrayFolderMode ?? 'flat',
    xrayTestMode: options.xrayTestMode ?? 'five',
    xrayTestFailureStart: -1,
    resetXrayCounts: true,
  })
  await signInWithOAuth(page)
  await connectXrayAndSelectProject(page)
  if (!page.url().includes('/repository')) await page.getByTestId('repository-link').first().click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('pull-from-xray').click()
  await expect(page.getByTestId('pull-success')).toContainText('Pulled 5 tests, 4 folders')
}

/** Asserts the page is on /login and carries the given decoded `next` path (the browser may re-serialize the query). */
export async function expectLoginWithNext(page: Page, next: string) {
  await expect(page).toHaveURL(/\/login\?/)
  expect(new URL(page.url()).searchParams.get('next')).toBe(next)
}
