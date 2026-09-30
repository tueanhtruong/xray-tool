import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { mockServicesUrl } from '../tests/support/env'
import { signInWithOAuth } from './support'

async function resetXrayMock(request: APIRequestContext) {
  await request.post(new URL('/__control', mockServicesUrl()).toString(), {
    data: { xrayMode: 'valid', resetXrayCounts: true },
  })
}

const signIn = signInWithOAuth

test('verifies and saves Xray credentials while exposing only connection metadata', async ({
  page,
  request,
}) => {
  await resetXrayMock(request)
  await signIn(page)
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'EU', exact: true }).click()
  await page.getByLabel('Xray client ID').fill('mock-xray-client-id')
  await page.getByLabel('Xray client secret').fill('mock-xray-client-secret')
  await page.getByTestId('xray-test-save').click()

  await expect(page.getByTestId('xray-connection-settings')).toContainText('Connected to Xray Cloud')
  await expect(page.getByTestId('xray-connection-status')).toContainText('EU')
  await expect(page.getByLabel('Xray client ID')).toHaveValue('')
  await expect(page.getByLabel('Xray client secret')).toHaveValue('')

  const cookies = await page.context().cookies()
  expect(JSON.stringify(cookies)).not.toContain('mock-xray-client-secret')
  const session = cookies.find((cookie) => cookie.name === 'nuxt-session')
  const response = await page.request.get('/api/auth/xray', {
    headers: { cookie: `nuxt-session=${session?.value}` },
  })
  const responseText = await response.text()
  expect(response.status()).toBe(200)
  expect(responseText).toContain('EU')
  expect(responseText).not.toContain('mock-xray-client-id')
  expect(responseText).not.toContain('mock-xray-client-secret')
  expect(responseText).not.toMatch(/header\.[A-Za-z0-9_-]+\.signature/)
})

test('shows credential rejection and keeps failed credentials out of the page', async ({ page, request }) => {
  await resetXrayMock(request)
  await signIn(page)
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Global', exact: true }).click()
  await page.getByLabel('Xray client ID').fill('mock-xray-client-id')
  const invalidSecret = 'deliberately-invalid-xray-secret'
  await page.getByLabel('Xray client secret').fill(invalidSecret)
  await request.post(new URL('/__control', mockServicesUrl()).toString(), {
    data: { xrayMode: 'invalid-credentials' },
  })
  await page.getByTestId('xray-test-save').click()
  await expect(page.getByTestId('xray-error')).toContainText(
    'Xray rejected these API keys. Create a key in Jira > Apps > Xray > API Keys.',
  )
  await expect(page.getByTestId('xray-error')).not.toContainText(invalidSecret)
  await expect(page.getByLabel('Xray client secret')).toHaveValue('')
  await request.post(new URL('/__control', mockServicesUrl()).toString(), {
    data: { xrayMode: 'valid' },
  })
})
