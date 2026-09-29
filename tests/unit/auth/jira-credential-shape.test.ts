import { describe, expect, it } from 'vitest'
import { hasValidJiraCredentialShape } from '~~/shared/auth/jira-credential-shape'

const oauth = {
  authMethod: 'OAUTH' as const,
  accessToken: 'encrypted-access',
  refreshToken: 'encrypted-refresh',
  expiresAt: new Date(),
  apiToken: null,
  apiEmail: null,
}

const apiToken = {
  authMethod: 'API_TOKEN' as const,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  apiToken: 'encrypted-token',
  apiEmail: 'user@example.com',
}

describe('hasValidJiraCredentialShape', () => {
  it('accepts well-formed OAuth and API-token connections', () => {
    expect(hasValidJiraCredentialShape({ cloudId: 'cloud-id' }, oauth)).toBe(true)
    expect(hasValidJiraCredentialShape({ cloudId: null }, apiToken)).toBe(true)
  })

  it('rejects missing or mixed auth material', () => {
    expect(hasValidJiraCredentialShape({ cloudId: null }, oauth)).toBe(false)
    expect(
      hasValidJiraCredentialShape(
        { cloudId: 'cloud-id' },
        { ...oauth, apiToken: 'encrypted-api-token' },
      ),
    ).toBe(false)
    expect(
      hasValidJiraCredentialShape(
        { cloudId: null },
        { ...apiToken, refreshToken: 'encrypted-refresh' },
      ),
    ).toBe(false)
  })
})
