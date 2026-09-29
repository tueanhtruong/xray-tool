import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { mockServicesUrl } from '../tests/support/env'

async function resetMock(request: APIRequestContext) {
  await request.post(new URL('/__control', mockServicesUrl()).toString(), {
    data: { resetApiTokenMyselfCount: true },
  })
}

async function signIn(page: import('@playwright/test').Page, token = 'mock-valid-api-token') {
  await page.goto('/login')
  await page.getByLabel('Jira site URL').fill('https://one.atlassian.net')
  await page.getByLabel('Atlassian email').fill('qa@example.com')
  await page.getByLabel('API token').fill(token)
  await page.getByTestId('api-token-submit').click()
}

test('connects with an API token, shows safe settings, replaces the token, and disconnects', async ({
  page,
  request,
}) => {
  await resetMock(request)
  await signIn(page)
  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('connection-settings')).toContainText('API token')
  await expect(page.getByTestId('connection-settings')).toContainText('qa@example.com')
  const cookies = await page.context().cookies()
  expect(JSON.stringify(cookies)).not.toContain('mock-valid-api-token')
  const session = cookies.find((cookie) => cookie.name === 'nuxt-session')
  const cookieHeader = `nuxt-session=${session?.value}`

  const settings = await page.request.get('/api/auth/connection', {
    headers: { cookie: cookieHeader },
  })
  const settingsText = await settings.text()
  expect(settings.status()).toBe(200)
  expect(settingsText).not.toContain('mock-valid-api-token')

  const replacement = await page.request.put('/api/auth/jira/api-token', {
    headers: { cookie: cookieHeader, origin: new URL(page.url()).origin },
    data: { apiToken: 'mock-valid-api-token' },
  })
  expect(replacement.status()).toBe(200)

  await page.getByTestId('disconnect').click()
  await expect(page).toHaveURL('/login')
})

test('shows Jira credential rejection without echoing the submitted token', async ({ page }) => {
  const token = 'deliberately-invalid-token'
  await signIn(page, token)
  await expect(page.getByTestId('api-token-error')).toContainText(
    'Jira rejected these credentials. Check the email and create a new API token at id.atlassian.com.',
  )
  await expect(page.getByTestId('api-token-error')).not.toContainText(token)
})

test('rejects unsafe site URLs before the mock receives a request', async ({ page, request }) => {
  await resetMock(request)
  await page.goto('/login')
  await page.getByLabel('Jira site URL').fill('https://acme.atlassian.net.evil.io')
  await page.getByLabel('Atlassian email').fill('qa@example.com')
  await page.getByLabel('API token').fill('mock-valid-api-token')
  await page.getByTestId('api-token-submit').click()
  await expect(page.getByTestId('api-token-error')).toContainText('allowed HTTPS Jira site URL')
  const status = await request.get(new URL('/__control', mockServicesUrl()).toString())
  expect((await status.json()).apiTokenMyselfCount).toBe(0)
})

test('offers an actionable path to disconnect an existing OAuth connection', async ({
  page,
  request,
}) => {
  await request.post(new URL('/__control', mockServicesUrl()).toString(), {
    data: { mode: 'single' },
  })
  await page.goto('/login')
  await page.getByTestId('jira-login').click()
  await expect(page).toHaveURL('/')
  await page.getByTestId('logout').click()
  await expect(page).toHaveURL('/login')

  await page.getByLabel('Jira site URL').fill('https://one.example.atlassian.net')
  await page.getByLabel('Atlassian email').fill('qa@example.com')
  await page.getByLabel('API token').fill('mock-valid-api-token')
  await page.getByTestId('api-token-submit').click()
  await expect(page.getByTestId('api-token-error')).toContainText(
    'This Jira site already has a connection.',
  )
  await page.getByTestId('open-existing-connection').click()
  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('connection-settings')).toContainText('Atlassian OAuth')

  await page.getByTestId('disconnect').click()
  await expect(page).toHaveURL('/login')
  await page.getByLabel('Jira site URL').fill('https://one.example.atlassian.net')
  await page.getByLabel('Atlassian email').fill('qa@example.com')
  await page.getByLabel('API token').fill('mock-valid-api-token')
  await page.getByTestId('api-token-submit').click()
  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('connection-settings')).toContainText('API token')
})
