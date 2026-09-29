import { describe, expect, it } from 'vitest'
import { runBuiltServerUntilExit } from '../support/built-server'

const VALID_DB = 'postgresql://xray:xray@127.0.0.1:5432/xray_test'

describe('runtime config fail-fast (built server)', () => {
  it('exits non-zero naming NUXT_DATABASE_URL and .env.example when it is unset', async () => {
    const { code, stderr } = await runBuiltServerUntilExit({})
    expect(code).not.toBe(0)
    expect(stderr).toContain('NUXT_DATABASE_URL')
    expect(stderr).toContain('.env.example')
  })

  it('exits non-zero naming NUXT_MOCK_SERVICES_URL when it is not a URL', async () => {
    const { code, stderr } = await runBuiltServerUntilExit({
      NUXT_DATABASE_URL: VALID_DB,
      NUXT_MOCK_SERVICES_URL: 'not-a-url',
    })
    expect(code).not.toBe(0)
    expect(stderr).toContain('NUXT_MOCK_SERVICES_URL')
  })

  it('exits non-zero naming NUXT_INTEGRATION_TARGET and its allowed values', async () => {
    const { code, stderr } = await runBuiltServerUntilExit({
      NUXT_DATABASE_URL: VALID_DB,
      NUXT_INTEGRATION_TARGET: 'staging',
    })
    expect(code).not.toBe(0)
    expect(stderr).toContain('NUXT_INTEGRATION_TARGET must be one of: live, mock')
  })
})
