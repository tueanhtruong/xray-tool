import type { IntegrationTarget } from '#shared/config/schema'
import type { AtlassianOAuthConfig } from '../integrations/jira/oauth'

export function getOAuthConfig(): AtlassianOAuthConfig {
  const config = useRuntimeConfig()
  return {
    atlassianAuthUrl: config.atlassianAuthUrl || undefined,
    atlassianApiUrl: config.atlassianApiUrl || undefined,
    integrationTarget: (config.integrationTarget || 'live') as IntegrationTarget,
    mockServicesUrl: config.mockServicesUrl || 'http://localhost:4010',
    atlassianClientId: config.atlassianClientId || undefined,
    atlassianClientSecret: config.atlassianClientSecret || undefined,
    atlassianRedirectUri: config.atlassianRedirectUri || undefined,
  }
}
