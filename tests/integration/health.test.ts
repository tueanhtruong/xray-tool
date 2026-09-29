import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RunningServer } from '../support/built-server'
import { startBuiltServer } from '../support/built-server'
import { integrationTarget, loadEnv, mockServicesUrl } from '../support/env'

loadEnv()

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

const commonEnv = {
  NUXT_INTEGRATION_TARGET: integrationTarget(),
  NUXT_MOCK_SERVICES_URL: mockServicesUrl(),
}

describe('GET /api/health with the test database', () => {
  let server: RunningServer

  beforeAll(async () => {
    server = await startBuiltServer({
      ...commonEnv,
      NUXT_DATABASE_URL: process.env.NUXT_DATABASE_URL_TEST,
    })
  })
  afterAll(() => server?.stop())

  it('returns 200 with status ok, db ok and the package version', async () => {
    const res = await fetch(`${server.url}/api/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok', version })
    expect(version).not.toBe('')
  })
})

describe('GET /api/health with an unreachable database', () => {
  let server: RunningServer
  // Credentials and host here must never appear in the response.
  const unreachable = 'postgresql://leak-user:leak-secret@127.0.0.1:1/xray_test'

  beforeAll(async () => {
    server = await startBuiltServer({ ...commonEnv, NUXT_DATABASE_URL: unreachable })
  })
  afterAll(() => server?.stop())

  it('returns 200 with db down within 3 seconds and only the three fields', async () => {
    const started = Date.now()
    const res = await fetch(`${server.url}/api/health`)
    const elapsed = Date.now() - started
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(elapsed).toBeLessThan(3_000)
    const body = JSON.parse(text) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['db', 'status', 'version'])
    expect(body).toEqual({ status: 'ok', db: 'down', version })
    expect(text).not.toMatch(/leak-user|leak-secret|127\.0\.0\.1|ECONNREFUSED/)
  })
})
