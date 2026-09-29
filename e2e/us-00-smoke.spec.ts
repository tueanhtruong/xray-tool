import { expect, test } from '@playwright/test'

test('signed-out users are redirected to the login page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/login')
  await expect(page.getByTestId('jira-login')).toHaveText('Sign in with Atlassian')
  await expect(page).toHaveTitle(/Sign in · Xray Tool/)
})

test('GET /api/health returns status ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('ok')
  expect(body.db).toBe('ok')
})
