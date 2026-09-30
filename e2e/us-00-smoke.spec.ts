import { expect, test } from '@playwright/test'
import { expectLoginWithNext } from './support'

test('signed-out users are redirected from protected pages to the login page', async ({ page }) => {
  await page.goto('/settings')
  await expectLoginWithNext(page, '/settings')
  await expect(page.getByTestId('jira-login')).toHaveText('Continue with Atlassian')
  await expect(page).toHaveTitle(/Sign in · XrayBulk/)
})

test('the landing page is public', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('app-name')).toBeVisible()
})

test('GET /api/health returns status ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('ok')
  expect(body.db).toBe('ok')
})
