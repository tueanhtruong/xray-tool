import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { LogEntry, RunningServer } from '../support/built-server'
import { startBuiltServer } from '../support/built-server'
import { integrationTarget, loadEnv, mockServicesUrl } from '../support/env'

loadEnv()

const SAFE = /^[A-Za-z0-9-]{8,64}$/

const commonEnv = {
  NUXT_INTEGRATION_TARGET: integrationTarget(),
  NUXT_MOCK_SERVICES_URL: mockServicesUrl(),
}

/** Wait for the server's stdout pipe to deliver the entry (logs are written asynchronously). */
async function accessEntry(server: RunningServer, requestId: string): Promise<LogEntry> {
  return vi.waitFor(() => {
    const entry = server.logs().find((e) => e.msg === 'request' && e.requestId === requestId)
    if (!entry) throw new Error(`no access log entry for ${requestId}`)
    return entry
  })
}

describe('request IDs on the built server', () => {
  let server: RunningServer

  beforeAll(async () => {
    server = await startBuiltServer({
      ...commonEnv,
      NUXT_DATABASE_URL: process.env.NUXT_DATABASE_URL_TEST,
    })
  })
  afterAll(() => server?.stop())

  it('adds a generated x-request-id to /api/health', async () => {
    const res = await fetch(`${server.url}/api/health`)
    expect(res.status).toBe(200)
    expect(res.headers.get('x-request-id')).toMatch(SAFE)
  })

  it('adds x-request-id to a 404', async () => {
    const res = await fetch(`${server.url}/api/does-not-exist`)
    expect(res.status).toBe(404)
    expect(res.headers.get('x-request-id')).toMatch(SAFE)
  })

  it('generates a different ID for each request', async () => {
    const [a, b] = await Promise.all([
      fetch(`${server.url}/api/health`),
      fetch(`${server.url}/api/health`),
    ])
    expect(a.headers.get('x-request-id')).not.toBe(b.headers.get('x-request-id'))
  })

  it('echoes a safe inbound ID', async () => {
    const res = await fetch(`${server.url}/api/health`, {
      headers: { 'x-request-id': 'abc12345-def' },
    })
    expect(res.headers.get('x-request-id')).toBe('abc12345-def')
  })

  it.each([
    ['contains spaces and markup', 'evil id <script>alert(1)</script>'],
    ['contains a quote', 'abc12345"quoted'],
    ['is 65 characters', 'a'.repeat(65)],
    ['is too short', 'zq7'],
    ['contains an underscore', 'abc_12345'],
  ])('replaces an inbound ID that %s, and never logs it', async (_label, unsafe) => {
    const res = await fetch(`${server.url}/api/health`, { headers: { 'x-request-id': unsafe } })
    const id = res.headers.get('x-request-id')!
    expect(id).not.toBe(unsafe)
    expect(id).toMatch(SAFE)
    await accessEntry(server, id)
    expect(server.output()).not.toContain(unsafe)
  })

  it('writes one access log entry matching the response header', async () => {
    const res = await fetch(`${server.url}/api/health`)
    const id = res.headers.get('x-request-id')!
    const entry = await accessEntry(server, id)
    expect(entry).toMatchObject({ level: 'info', method: 'GET', path: '/api/health', status: 200 })
    expect(typeof entry.durationMs).toBe('number')
    expect(server.logs().filter((e) => e.msg === 'request' && e.requestId === id)).toHaveLength(1)
  })

  it('logs error responses too, with the error status', async () => {
    const res = await fetch(`${server.url}/api/does-not-exist`)
    const entry = await accessEntry(server, res.headers.get('x-request-id')!)
    expect(entry).toMatchObject({ path: '/api/does-not-exist', status: 404 })
  })

  it('never logs the query string', async () => {
    const res = await fetch(`${server.url}/api/health?code=oauth-code-abc123&state=state-xyz789`)
    const id = res.headers.get('x-request-id')!
    const entry = await accessEntry(server, id)
    expect(entry.path).toBe('/api/health')
    expect(server.output()).not.toContain('oauth-code-abc123')
    expect(server.output()).not.toContain('state-xyz789')
  })

  it('gives each concurrent request its own ID in its own access entry', async () => {
    const ids = Array.from(
      { length: 12 },
      (_, i) => `concurrent-${i.toString().padStart(2, '0')}-id`,
    )
    const paths = ids.map((_, i) => (i % 2 === 0 ? '/api/health' : '/api/auth/session'))
    await Promise.all(
      ids.map((id, i) => fetch(`${server.url}${paths[i]}`, { headers: { 'x-request-id': id } })),
    )
    for (const [i, id] of ids.entries()) {
      const entry = await accessEntry(server, id)
      expect(entry.path).toBe(paths[i])
    }
  })
})

describe('request ID on log lines written below the route handler', () => {
  let server: RunningServer
  // Credentials in this URL must never reach the response or the log.
  const unreachable = 'postgresql://leak-user:leak-secret@127.0.0.1:1/xray_test'

  beforeAll(async () => {
    server = await startBuiltServer({ ...commonEnv, NUXT_DATABASE_URL: unreachable })
  })
  afterAll(() => server?.stop())

  it('attaches the request ID without the caller passing it, and redacts the error', async () => {
    const res = await fetch(`${server.url}/api/health`, {
      headers: { 'x-request-id': 'probe-failure-0001' },
    })
    expect((await res.json()).db).toBe('down')

    const entry = await vi.waitFor(() => {
      const found = server
        .logs()
        .find((e) => e.msg === 'database probe failed' && e.requestId === 'probe-failure-0001')
      if (!found) throw new Error('probe failure not logged yet')
      return found
    })
    expect(entry).toMatchObject({ level: 'warn', requestId: 'probe-failure-0001' })
    expect(server.output()).not.toContain('leak-secret')
    expect(server.output()).not.toContain('leak-user')
  })

  it('startup log lines carry no request ID', async () => {
    const startup = server
      .logs()
      .filter((e) => e.msg !== 'request' && e.msg !== 'database probe failed')
    for (const entry of startup) expect(entry).not.toHaveProperty('requestId')
  })
})
