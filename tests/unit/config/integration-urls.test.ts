import { describe, expect, it } from 'vitest'
import { LIVE_INTEGRATION_URLS, resolveIntegrationUrls } from '~~/server/utils/integration-urls'

const base = {
  integrationTarget: 'live' as const,
  mockServicesUrl: 'http://localhost:4010',
  atlassianAuthUrl: undefined,
  atlassianApiUrl: undefined,
  xrayBaseUrl: undefined,
}

describe('resolveIntegrationUrls', () => {
  it('resolves official endpoints for the live target', () => {
    expect(resolveIntegrationUrls(base)).toEqual({
      atlassianAuthUrl: 'https://auth.atlassian.com',
      atlassianApiUrl: 'https://api.atlassian.com',
      xrayBaseUrl: 'https://xray.cloud.getxray.app',
    })
    expect(resolveIntegrationUrls(base)).toEqual(LIVE_INTEGRATION_URLS)
  })

  it('resolves paths under the mock URL for the mock target', () => {
    expect(resolveIntegrationUrls({ ...base, integrationTarget: 'mock' })).toEqual({
      atlassianAuthUrl: 'http://localhost:4010/atlassian-auth',
      atlassianApiUrl: 'http://localhost:4010/atlassian-api',
      xrayBaseUrl: 'http://localhost:4010/xray',
    })
  })

  it('ignores a trailing slash on the mock URL', () => {
    const urls = resolveIntegrationUrls({
      ...base,
      integrationTarget: 'mock',
      mockServicesUrl: 'http://mock:9000/',
    })
    expect(urls.xrayBaseUrl).toBe('http://mock:9000/xray')
  })

  it.each(['live', 'mock'] as const)('an explicit override wins for target %s', (target) => {
    const urls = resolveIntegrationUrls({
      ...base,
      integrationTarget: target,
      xrayBaseUrl: 'https://eu.xray.cloud.getxray.app',
    })
    expect(urls.xrayBaseUrl).toBe('https://eu.xray.cloud.getxray.app')
  })
})
