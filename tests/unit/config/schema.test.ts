import { describe, expect, it } from 'vitest'
import { parseServerConfig, serverConfigSchema, toEnvName } from '~~/shared/config/schema'

const DB = 'postgresql://xray:xray@localhost:5432/xray_dev'

/** Mirrors nuxt.config.ts runtimeConfig: every key present, empty by default. */
function runtimeConfig(overrides: Record<string, unknown> = {}) {
  return {
    databaseUrl: '',
    integrationTarget: '',
    mockServicesUrl: '',
    atlassianAuthUrl: '',
    atlassianApiUrl: '',
    xrayBaseUrl: '',
    atlassianClientId: '',
    atlassianClientSecret: '',
    atlassianRedirectUri: '',
    encryptionKey: '',
    public: { appVersion: '0.0.0' },
    ...overrides,
  }
}

describe('serverConfigSchema', () => {
  it('accepts a minimal valid config and applies defaults', () => {
    const result = parseServerConfig(runtimeConfig({ databaseUrl: DB }))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.config).toMatchObject({
      databaseUrl: DB,
      integrationTarget: 'live',
      mockServicesUrl: 'http://localhost:4010',
    })
    expect(result.config.xrayBaseUrl).toBeUndefined()
    expect(result.config.atlassianClientSecret).toBeUndefined()
  })

  it('accepts a config with keys absent entirely', () => {
    expect(serverConfigSchema.safeParse({ databaseUrl: DB }).success).toBe(true)
  })

  it('does not require Atlassian or Xray credentials', () => {
    expect(parseServerConfig(runtimeConfig({ databaseUrl: DB })).success).toBe(true)
  })

  it('names NUXT_DATABASE_URL and .env.example when the DB URL is missing', () => {
    const result = parseServerConfig(runtimeConfig())
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.message).toContain('NUXT_DATABASE_URL is required')
    expect(result.message).toContain('.env.example')
  })

  it('rejects a non-PostgreSQL database URL', () => {
    const result = parseServerConfig(runtimeConfig({ databaseUrl: 'mysql://localhost/x' }))
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.message).toContain('NUXT_DATABASE_URL must be a PostgreSQL URL')
  })

  it('rejects an invalid mock services URL and names its env variable', () => {
    const result = parseServerConfig(
      runtimeConfig({ databaseUrl: DB, mockServicesUrl: 'not-a-url' }),
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.message).toContain('NUXT_MOCK_SERVICES_URL must be an http(s) URL')
  })

  it('rejects an unknown integration target and lists the allowed values', () => {
    const result = parseServerConfig(
      runtimeConfig({ databaseUrl: DB, integrationTarget: 'staging' }),
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.message).toContain('NUXT_INTEGRATION_TARGET must be one of: live, mock')
  })

  it('reports every invalid variable in one message', () => {
    const result = parseServerConfig(
      runtimeConfig({ integrationTarget: 'staging', xrayBaseUrl: 'ftp://x' }),
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.message).toContain('NUXT_DATABASE_URL')
    expect(result.message).toContain('NUXT_INTEGRATION_TARGET')
    expect(result.message).toContain('NUXT_XRAY_BASE_URL')
  })
})

describe('toEnvName', () => {
  it.each([
    ['databaseUrl', 'NUXT_DATABASE_URL'],
    ['mockServicesUrl', 'NUXT_MOCK_SERVICES_URL'],
    ['integrationTarget', 'NUXT_INTEGRATION_TARGET'],
    ['xrayBaseUrl', 'NUXT_XRAY_BASE_URL'],
  ])('%s -> %s', (key, env) => {
    expect(toEnvName(key)).toBe(env)
  })
})
