import { expect, test } from '@playwright/test'

test('home page renders the app name', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-name')).toHaveText('Xray Tool')
  await expect(page).toHaveTitle(/Xray Tool/)
})

test('GET /api/health returns status ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('ok')
  expect(body.db).toBe('ok')
})
