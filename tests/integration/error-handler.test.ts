import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import errorHandler from '~~/server/error-handler'
import { httpError } from '~~/server/utils/http-error'
import { assignRequestId, type RequestEventLike } from '~~/server/utils/request-id'
import type { RunningServer } from '../support/built-server'
import { startBuiltServer } from '../support/built-server'
import { integrationTarget, loadEnv, mockServicesUrl } from '../support/env'

loadEnv()

const TOKEN = 'ATATT3xFfGF0supersecrettoken0123456789'
const JWT_LIKE = 'abc.def.ghi'

/**
 * A minimal server that runs the real error handler on real Node requests and responses.
 * No debug route is shipped in the app; the routes below exist only in this test.
 */
const routes: Record<string, () => never> = {
  '/api/boom': () => {
    throw new Error(`failed with token ${TOKEN}`)
  },
  '/api/bearer': () => {
    throw new Error(`upstream rejected Bearer ${JWT_LIKE}`)
  },
  '/api/bad-request': () => {
    throw httpError(400, 'Summary is required')
  },
  '/api/upstream': () => {
    const cause = new Error(`raw upstream body: ${TOKEN}`)
    throw Object.assign(new Error('Jira request failed', { cause }), {
      statusCode: 502,
      statusMessage: `Bad Gateway ${TOKEN}`,
      data: { upstreamBody: { access_token: TOKEN } },
    })
  },
  '/api/leaky-status-text': () => {
    throw Object.assign(new Error('nope'), { statusCode: 404, statusMessage: `secret ${TOKEN}` })
  },
  '/page': () => {
    throw new Error(`page failed ${TOKEN}`)
  },
}

describe('error handler (real handler, in-process server, production mode)', () => {
  let server: Server
  let base: string
  let lines: string[]

  beforeAll(async () => {
    server = createServer((req, res) => {
      const event: RequestEventLike = { node: { req, res }, context: {}, path: req.url }
      assignRequestId(event)
      try {
        const route = routes[req.url ?? '']
        if (route) route()
        else res.end('ok')
      } catch (error) {
        errorHandler(error, event)
        if (!res.writableEnded) {
          res.statusCode = 299
          res.end('fell through to the framework handler')
        }
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    lines = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk))
      return true
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  const entries = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>)

  it('answers an unexpected error with only statusCode, generic message, requestId', async () => {
    const res = await fetch(`${base}/api/boom`)
    const text = await res.text()
    const body = JSON.parse(text)
    expect(res.status).toBe(500)
    expect(Object.keys(body).sort()).toEqual(['message', 'requestId', 'statusCode'])
    expect(body).toMatchObject({ statusCode: 500, message: 'Internal Server Error' })
    expect(body.requestId).toBe(res.headers.get('x-request-id'))
    expect(text).not.toContain(TOKEN)
    expect(text).not.toMatch(/stack|\bat \w/)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('keeps the message of a deliberate client error', async () => {
    const res = await fetch(`${base}/api/bad-request`)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      statusCode: 400,
      message: 'Summary is required',
      requestId: res.headers.get('x-request-id'),
    })
  })

  it('never exposes an upstream body, its cause, or its status text', async () => {
    const res = await fetch(`${base}/api/upstream`)
    const text = await res.text()
    expect(res.status).toBe(502)
    expect(JSON.parse(text).message).toBe('Bad Gateway')
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain('upstream')
    expect(res.statusText).toBe('Bad Gateway')
  })

  it('does not echo an error-supplied status text in the status line', async () => {
    const res = await fetch(`${base}/api/leaky-status-text`)
    expect(res.status).toBe(404)
    expect(res.statusText).toBe('Not Found')
    expect(JSON.stringify([...res.headers])).not.toContain(TOKEN)
  })

  it('echoes an inbound request ID in the error response', async () => {
    const res = await fetch(`${base}/api/boom`, { headers: { 'x-request-id': 'inbound-id-0001' } })
    expect(res.headers.get('x-request-id')).toBe('inbound-id-0001')
    expect((await res.json()).requestId).toBe('inbound-id-0001')
  })

  it('logs a 5xx at error level with the stack, redacted, and the request ID', async () => {
    const res = await fetch(`${base}/api/bearer`, { headers: { 'x-request-id': 'log-check-0001' } })
    await res.text()
    const entry = entries().find((e) => e.msg === 'request failed')!
    expect(entry).toMatchObject({ level: 'error', statusCode: 500, requestId: 'log-check-0001' })
    const text = JSON.stringify(entry)
    expect(text).toContain('stack')
    expect(text).toContain('upstream rejected')
    expect(text).not.toContain(JWT_LIKE)
  })

  it('redacts secrets in the error, its cause chain, and its data when logging', async () => {
    await (await fetch(`${base}/api/upstream`)).text()
    expect(lines.join('')).not.toContain(TOKEN)
    expect(lines.join('')).toContain('Jira request failed')
  })

  it('logs a 4xx at warn level without a stack', async () => {
    await (await fetch(`${base}/api/bad-request`)).text()
    const entry = entries().find((e) => e.msg === 'request failed')!
    expect(entry).toMatchObject({
      level: 'warn',
      statusCode: 400,
      errorMessage: 'Summary is required',
    })
    expect(JSON.stringify(entry)).not.toContain('stack')
  })

  it('logs but does not answer non-API requests, leaving them to the framework handler', async () => {
    const res = await fetch(`${base}/page`)
    expect(res.status).toBe(299)
    expect(await res.text()).toBe('fell through to the framework handler')
    const entry = entries().find((e) => e.msg === 'request failed')!
    expect(entry.level).toBe('error')
    expect(lines.join('')).not.toContain(TOKEN)
  })
})

describe('error handler wiring in the built server', () => {
  let server: RunningServer

  beforeAll(async () => {
    server = await startBuiltServer({
      NUXT_INTEGRATION_TARGET: integrationTarget(),
      NUXT_MOCK_SERVICES_URL: mockServicesUrl(),
      NUXT_DATABASE_URL: process.env.NUXT_DATABASE_URL_TEST,
    })
  })
  afterAll(() => server?.stop())

  it('answers an unknown API route with the sanitized JSON contract', async () => {
    const res = await fetch(`${server.url}/api/does-not-exist`)
    const text = await res.text()
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['message', 'requestId', 'statusCode'])
    expect(JSON.parse(text)).toEqual({
      statusCode: 404,
      message: 'Not Found',
      requestId: res.headers.get('x-request-id'),
    })
    expect(res.statusText).toBe('Not Found')
  })

  it('logs the unknown route as a warn entry without a stack', async () => {
    const res = await fetch(`${server.url}/api/does-not-exist`)
    const id = res.headers.get('x-request-id')!
    const entry = await vi.waitFor(() => {
      const found = server.logs().find((e) => e.msg === 'request failed' && e.requestId === id)
      if (!found) throw new Error('not logged yet')
      return found
    })
    expect(entry).toMatchObject({ level: 'warn', statusCode: 404 })
    expect(JSON.stringify(entry)).not.toContain('stack')
  })

  it('still renders the framework HTML error page for page requests', async () => {
    const res = await fetch(`${server.url}/no-such-page`, { headers: { accept: 'text/html' } })
    const html = await res.text()
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('x-request-id')).toMatch(/^[A-Za-z0-9-]{8,64}$/)
    expect(html).not.toMatch(/at \w+ \(file:/)
  })
})
