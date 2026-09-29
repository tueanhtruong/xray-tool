import { describe, expect, it } from 'vitest'
import { toClientError } from '#shared/security/client-error'

const requestId = 'req-12345678'
const TOKEN = 'ATATT3xFfGF0supersecrettoken0123456789'

function httpError(statusCode: number, message: string, expose = false) {
  return Object.assign(new Error(message), {
    statusCode,
    ...(expose ? { data: { expose: true } } : {}),
  })
}

describe('toClientError', () => {
  it('body has exactly statusCode, message, requestId', () => {
    const { body } = toClientError(new Error('boom'), { requestId })
    expect(Object.keys(body).sort()).toEqual(['message', 'requestId', 'statusCode'])
  })

  it('hides the message of an unexpected error and returns 500', () => {
    const { statusCode, body } = toClientError(new Error(`failed with ${TOKEN}`), { requestId })
    expect(statusCode).toBe(500)
    expect(body).toEqual({ statusCode: 500, message: 'Internal Server Error', requestId })
    expect(JSON.stringify(body)).not.toContain(TOKEN)
  })

  it('never includes stack, cause, or data', () => {
    const error = Object.assign(new Error('x', { cause: new Error(TOKEN) }), {
      statusCode: 500,
      data: { upstream: { token: TOKEN }, expose: true },
    })
    const text = JSON.stringify(toClientError(error, { requestId }).body)
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain('stack')
    expect(text).not.toContain('upstream')
  })

  it('keeps the message of a deliberate client error', () => {
    const { statusCode, body } = toClientError(httpError(400, 'Summary is required', true), {
      requestId,
    })
    expect(statusCode).toBe(400)
    expect(body.message).toBe('Summary is required')
  })

  it('uses the generic message for a client status of unknown origin', () => {
    expect(
      toClientError(httpError(404, `Cannot find /api/x ${TOKEN}`), { requestId }).body.message,
    ).toBe('Not Found')
    expect(toClientError(httpError(418, 'teapot'), { requestId }).body.message).toBe('Bad Request')
  })

  it('never exposes the message of a 5xx, even when marked', () => {
    const { body } = toClientError(httpError(502, `upstream said ${TOKEN}`, true), { requestId })
    expect(body).toEqual({ statusCode: 502, message: 'Bad Gateway', requestId })
  })

  it('scrubs credentials from a deliberate message', () => {
    const { body } = toClientError(httpError(400, 'bad header Bearer abc.def.ghi', true), {
      requestId,
    })
    expect(body.message).not.toContain('abc.def.ghi')
  })

  it('falls back to the generic message for empty deliberate messages', () => {
    expect(toClientError(httpError(400, '  ', true), { requestId }).body.message).toBe(
      'Bad Request',
    )
  })

  it.each([
    undefined,
    null,
    'string',
    42,
    {},
    { statusCode: 'x' },
    { statusCode: 200 },
    { statusCode: 700 },
  ])('treats %j as a 500', (thrown) => {
    expect(toClientError(thrown, { requestId }).statusCode).toBe(500)
  })
})
