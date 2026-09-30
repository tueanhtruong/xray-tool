import { describe, expect, it } from 'vitest'
import {
  isXrayJwtReusable,
  isXrayRegion,
  XRAY_REGION_URLS,
  xrayJwtExpiresAt,
} from '#shared/xray/regions'
import { resolveXrayBaseUrl } from '~~/server/utils/integration-urls'

function jwtWithPayload(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${encoded}.signature`
}

const config = {
  integrationTarget: 'live' as const,
  mockServicesUrl: 'http://localhost:4010',
  atlassianAuthUrl: undefined,
  atlassianApiUrl: undefined,
  xrayBaseUrl: undefined,
}

describe('Xray regions', () => {
  it('maps each supported region to a fixed endpoint', () => {
    expect(XRAY_REGION_URLS).toEqual({
      GLOBAL: 'https://xray.cloud.getxray.app',
      US: 'https://us.xray.cloud.getxray.app',
      EU: 'https://eu.xray.cloud.getxray.app',
      AU: 'https://au.xray.cloud.getxray.app',
    })
    expect(resolveXrayBaseUrl(config, 'EU')).toBe(XRAY_REGION_URLS.EU)
  })

  it('accepts only the explicit supported region values', () => {
    expect(isXrayRegion('GLOBAL')).toBe(true)
    expect(isXrayRegion('US')).toBe(true)
    expect(isXrayRegion('EU')).toBe(true)
    expect(isXrayRegion('AU')).toBe(true)
    expect(isXrayRegion('https://attacker.example')).toBe(false)
    expect(isXrayRegion(undefined)).toBe(false)
  })

  it('uses the explicit Xray override and mock-resolved URL when configured', () => {
    expect(resolveXrayBaseUrl({ ...config, xrayBaseUrl: 'https://override.example/' }, 'AU'))
      .toBe('https://override.example')
    expect(resolveXrayBaseUrl({ ...config, integrationTarget: 'mock' }, 'AU'))
      .toBe('http://localhost:4010/xray')
  })
})

describe('Xray JWT expiry', () => {
  it('decodes a finite exp claim without verifying or trusting other JWT data', () => {
    expect(xrayJwtExpiresAt(jwtWithPayload({ exp: 1_900_000_000, sub: 'example' })))
      .toEqual(new Date(1_900_000_000_000))
  })

  it.each([
    'not-a-jwt',
    'a.!.c',
    jwtWithPayload({}),
    jwtWithPayload({ exp: '1900000000' }),
    jwtWithPayload({ exp: Number.POSITIVE_INFINITY }),
    jwtWithPayload({ exp: 0 }),
  ])('rejects malformed or unusable tokens: %s', (jwt) => {
    expect(xrayJwtExpiresAt(jwt)).toBeUndefined()
  })

  it('treats tokens inside the 60-second window and expired tokens as not reusable', () => {
    const now = 1_000_000
    expect(isXrayJwtReusable(new Date(now + 60_000), now)).toBe(false)
    expect(isXrayJwtReusable(new Date(now - 1), now)).toBe(false)
    expect(isXrayJwtReusable(new Date(now + 60_001), now)).toBe(true)
    expect(isXrayJwtReusable(undefined, now)).toBe(false)
  })
})
