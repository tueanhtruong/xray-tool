import { describe, expect, it } from 'vitest'
import { isTokenExpiring, TOKEN_REFRESH_WINDOW_MS } from '../../../shared/auth/token-expiry'

describe('isTokenExpiring', () => {
  const now = 1_000_000

  it('refreshes at or inside the 60-second window, including an expired token', () => {
    expect(isTokenExpiring(now + TOKEN_REFRESH_WINDOW_MS, now)).toBe(true)
    expect(isTokenExpiring(now + TOKEN_REFRESH_WINDOW_MS - 1, now)).toBe(true)
    expect(isTokenExpiring(now - 1, now)).toBe(true)
  })

  it('does not refresh when expiry is beyond the 60-second window', () => {
    expect(isTokenExpiring(now + TOKEN_REFRESH_WINDOW_MS + 1, now)).toBe(false)
  })

  it('accepts Date values', () => {
    expect(isTokenExpiring(new Date(now + 10_000), now)).toBe(true)
  })
})
