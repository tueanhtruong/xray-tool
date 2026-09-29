import { expect, test } from '@playwright/test'

const SAFE = /^[A-Za-z0-9-]{8,64}$/

test('every API response carries an x-request-id', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.ok()).toBe(true)
  expect(res.headers()['x-request-id']).toMatch(SAFE)
})

test('a safe inbound x-request-id is echoed back', async ({ request }) => {
  const res = await request.get('/api/health', { headers: { 'x-request-id': 'e2e-request-0001' } })
  expect(res.headers()['x-request-id']).toBe('e2e-request-0001')
})

test('an unsafe inbound x-request-id is replaced', async ({ request }) => {
  const res = await request.get('/api/health', {
    headers: { 'x-request-id': 'bad id with spaces' },
  })
  const id = res.headers()['x-request-id']
  expect(id).not.toBe('bad id with spaces')
  expect(id).toMatch(SAFE)
})

test('a failing API request returns the sanitized error contract with the same request ID', async ({
  request,
}) => {
  const res = await request.get('/api/does-not-exist')
  expect(res.status()).toBe(404)
  expect(await res.json()).toEqual({
    statusCode: 404,
    message: 'Not Found',
    requestId: res.headers()['x-request-id'],
  })
})
