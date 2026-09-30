import { describe, expect, it } from 'vitest'
import { retryAfterMs, safeGraphqlMessage, XRAY_RETRY_POLICY } from '~~/server/integrations/xray/client'

describe('Xray retry policy', () => {
  it('uses at most three total attempts and caps Retry-After waits at 30 seconds', () => {
    expect(XRAY_RETRY_POLICY).toEqual({ maxAttempts: 3, maxRetryDelayMs: 30_000 })
    expect(retryAfterMs('2', 0)).toBe(2_000)
    expect(retryAfterMs('120', 0)).toBe(30_000)
  })

  it('parses HTTP-date Retry-After values and rejects invalid/past values', () => {
    expect(retryAfterMs(new Date(5_000).toUTCString(), 0)).toBe(5_000)
    expect(retryAfterMs('not-a-date', 0)).toBeUndefined()
    expect(retryAfterMs(new Date(5_000).toUTCString(), 10_000)).toBeUndefined()
  })

  it('maps permission errors to actionable messages without forwarding arbitrary text', () => {
    expect(safeGraphqlMessage({ message: 'Forbidden access to project DEMO' }))
      .toContain('lacks permission for project DEMO')
    expect(safeGraphqlMessage({ message: 'unexpected upstream token=very-secret' }))
      .toBe('Xray could not complete this GraphQL operation. Check the API key permissions and try again.')
    expect(safeGraphqlMessage('bad response'))
      .toContain('Check the Xray API key permissions')
  })
})
