import { describe, expect, it } from 'vitest'
import { authorizationUrl, ATLASSIAN_OAUTH_SCOPES } from '../../../server/integrations/jira/oauth'

const config = {
  integrationTarget: 'mock' as const,
  mockServicesUrl: 'http://localhost:4010',
  atlassianClientId: 'client-id',
  atlassianClientSecret: 'client-secret',
  atlassianRedirectUri: 'http://localhost:3000/auth/jira/callback',
}

describe('Atlassian OAuth URL', () => {
  it('includes required 3LO audience, scopes, callback, prompt, response type, and state', () => {
    const url = new URL(authorizationUrl(config, 'opaque-state'))
    expect(url.origin).toBe('http://localhost:4010')
    expect(url.pathname).toBe('/atlassian-auth/authorize')
    expect(url.searchParams.get('audience')).toBe('api.atlassian.com')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(config.atlassianRedirectUri)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('opaque-state')
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(ATLASSIAN_OAUTH_SCOPES)
  })
})
