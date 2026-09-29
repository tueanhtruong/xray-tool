import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { mockServicesUrl } from '../tests/support/env'

async function setMode(request: APIRequestContext, mode: string) {
  await request.post(new URL('/__control', mockServicesUrl()).toString(), { data: { mode } })
}

test('signs in with one Jira site, hides tokens, and signs out', async ({ page, request }) => {
  await setMode(request, 'single')
  await page.goto('/login')
  await page.getByTestId('jira-login').click()
  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('app-name')).toHaveText('Xray Tool')
  await expect(page.getByText('Example One')).toBeVisible()

  const cookies = await page.context().cookies()
  const serializedCookies = JSON.stringify(cookies)
  expect(serializedCookies).not.toContain('mock-access-token')
  expect(serializedCookies).not.toContain('mock-refresh-token')
  const session = cookies.find((cookie) => cookie.name === 'nuxt-session')
  expect(session?.httpOnly).toBe(true)
  expect(session?.sameSite).toBe('Lax')

  const apiResponse = await page.request.get('/api/auth/session', {
    headers: { cookie: `nuxt-session=${session?.value}` },
  })
  expect(apiResponse.status()).toBe(200)
  const apiText = await apiResponse.text()
  expect(apiText).not.toMatch(/mock-(?:access|refresh)-token/i)

  await page.getByTestId('logout').click()
  await expect(page).toHaveURL('/login')
  await page.goto('/')
  await expect(page).toHaveURL('/login')
})

test('asks for a site when several Jira sites are accessible', async ({ page, request }) => {
  await setMode(request, 'multi')
  await page.goto('/login')
  await page.getByTestId('jira-login').click()
  await expect(page).toHaveURL('/auth/jira/select-site')
  await expect(page.getByText('Example One')).toBeVisible()
  await expect(page.getByText('Example Two')).toBeVisible()
  await page.getByLabel(/Example Two/).check()
  await page.getByTestId('select-site').click()
  await expect(page).toHaveURL('/')
  await expect(page.getByText('Example Two')).toBeVisible()
})

test('reports Atlassian consent denial on the login page', async ({ page, request }) => {
  await setMode(request, 'denied')
  await page.goto('/login')
  await page.getByTestId('jira-login').click()
  await expect(page).toHaveURL(/\/login\?message=access-denied/)
  await expect(page.getByTestId('login-message')).toContainText('access was not granted')
})

test('rejects a state mismatch without persisting OAuth credentials', async ({ page }) => {
  await page.goto('/auth/jira/callback?code=test-code&state=incorrect-state')
  await expect(page).toHaveURL(/verification-failed/)
  await expect(page.getByTestId('login-message')).toContainText(
    'Sign-in could not be verified. Please try again.',
  )
})

test('refreshes an expired access token transparently', async ({ page, request }) => {
  await setMode(request, 'expired')
  await page.goto('/login')
  await page.getByTestId('jira-login').click()
  await expect(page).toHaveURL('/')
  const session = (await page.context().cookies()).find((cookie) => cookie.name === 'nuxt-session')
  const response = await page.request.get('/api/jira/myself', {
    headers: { cookie: `nuxt-session=${session?.value}` },
  })
  expect(response.status()).toBe(200)
  expect(await response.text()).not.toMatch(/mock-(?:access|refresh)-token/i)
  const status = await request.get(new URL('/__control', mockServicesUrl()).toString())
  expect((await status.json()).refreshCount).toBe(1)
})

test('clears the session when the refresh token is revoked', async ({ page, request }) => {
  await setMode(request, 'revoked')
  await page.goto('/login')
  await page.getByTestId('jira-login').click()
  await expect(page).toHaveURL('/')
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/jira/myself')
    return { status: response.status, body: await response.text() }
  })
  expect(result.status).toBe(401)
  expect(result.body.toLowerCase()).toContain('sign in again')
  await page.goto('/')
  await expect(page).toHaveURL('/login')
})
