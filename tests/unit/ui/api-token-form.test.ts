import { describe, expect, it } from 'vitest'
import { SITE_URL_MESSAGE, validateApiTokenForm } from '#shared/ui/api-token-form'

const good = { siteUrl: 'https://acme.atlassian.net', email: 'a@b.co', apiToken: 'tok' }

describe('validateApiTokenForm', () => {
  it('accepts a valid form', () => {
    expect(validateApiTokenForm(good)).toEqual({ valid: true, errors: {} })
    expect(validateApiTokenForm({ ...good, siteUrl: 'https://acme.atlassian.net/' }).valid).toBe(true)
    expect(validateApiTokenForm({ ...good, siteUrl: 'https://one.example.atlassian.net' }).valid).toBe(true)
  })

  it('is invalid but error-free while fields are empty', () => {
    expect(validateApiTokenForm({ siteUrl: '', email: '', apiToken: '' })).toEqual({
      valid: false,
      errors: {},
    })
  })

  it.each(['http://acme.example.com', 'http://acme.atlassian.net', 'https://atlassian.net', 'https://acme.atlassian.net.evil.com', 'acme.atlassian.net'])(
    'rejects site %s',
    (siteUrl) => {
      const result = validateApiTokenForm({ ...good, siteUrl })
      expect(result.valid).toBe(false)
      expect(result.errors.siteUrl).toBe(SITE_URL_MESSAGE)
    },
  )

  it('rejects a malformed email', () => {
    const result = validateApiTokenForm({ ...good, email: 'nope' })
    expect(result.valid).toBe(false)
    expect(result.errors.email).toBeDefined()
  })

  it('requires a token', () => {
    expect(validateApiTokenForm({ ...good, apiToken: '' }).valid).toBe(false)
  })
})
