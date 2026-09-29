import { describe, expect, it } from 'vitest'
import { runBuiltServerUntilExit, startBuiltServer } from '../support/built-server'

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

  describe('NUXT_ENCRYPTION_KEY', () => {
    const sixteenBytes = Buffer.alloc(16, 7).toString('base64')

    it('exits non-zero with generation help when the key decodes to 16 bytes, without echoing it', async () => {
      const { code, stderr } = await runBuiltServerUntilExit({
        NUXT_DATABASE_URL: VALID_DB,
        NUXT_ENCRYPTION_KEY: sixteenBytes,
      })
      expect(code).not.toBe(0)
      expect(stderr).toContain('NUXT_ENCRYPTION_KEY')
      expect(stderr).toContain('32-byte')
      expect(stderr).toContain('openssl rand -base64 32')
      expect(stderr).not.toContain(sixteenBytes)
    })

    it('exits non-zero naming the variable when the key is not base64', async () => {
      const { code, stderr } = await runBuiltServerUntilExit({
        NUXT_DATABASE_URL: VALID_DB,
        NUXT_ENCRYPTION_KEY: 'not base64 !!!',
      })
      expect(code).not.toBe(0)
      expect(stderr).toContain('NUXT_ENCRYPTION_KEY')
    })

    it('starts with a valid key', async () => {
      const server = await startBuiltServer({ NUXT_DATABASE_URL: VALID_DB })
      await server.stop()
    })

    it('starts without a key, and warns once', async () => {
      const server = await startBuiltServer({
        NUXT_DATABASE_URL: VALID_DB,
        NUXT_ENCRYPTION_KEY: '',
      })
      try {
        const warnings = server.logs().filter((e) => e.level === 'warn')
        expect(warnings).toHaveLength(1)
        expect(String(warnings[0]?.msg)).toContain('NUXT_ENCRYPTION_KEY')
      } finally {
        await server.stop()
      }
    })
  })
})
