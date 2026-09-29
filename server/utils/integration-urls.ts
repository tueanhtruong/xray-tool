import type { ServerConfig } from '#shared/config/schema'

export const LIVE_INTEGRATION_URLS = {
  atlassianAuthUrl: 'https://auth.atlassian.com',
  atlassianApiUrl: 'https://api.atlassian.com',
  xrayBaseUrl: 'https://xray.cloud.getxray.app',
} as const

export interface IntegrationUrls {
  atlassianAuthUrl: string
  atlassianApiUrl: string
  xrayBaseUrl: string
  mockJiraSiteUrl?: string
}

type UrlConfig = Pick<
  ServerConfig,
  | 'integrationTarget'
  | 'mockServicesUrl'
  | 'atlassianAuthUrl'
  | 'atlassianApiUrl'
  | 'xrayBaseUrl'
>

/**
 * The ONLY place that branches on the integration target. Integration clients
 * receive these resolved URLs and never read `integrationTarget` themselves.
 * An explicit per-service override always wins over the target.
 */
export function resolveIntegrationUrls(config: UrlConfig): IntegrationUrls {
  const mock = config.mockServicesUrl.replace(/\/+$/, '')
  const derived: IntegrationUrls =
    config.integrationTarget === 'mock'
      ? {
          atlassianAuthUrl: `${mock}/atlassian-auth`,
          atlassianApiUrl: `${mock}/atlassian-api`,
          xrayBaseUrl: `${mock}/xray`,
          mockJiraSiteUrl: `${mock}/jira-site`,
        }
      : { ...LIVE_INTEGRATION_URLS }

  return {
    atlassianAuthUrl: config.atlassianAuthUrl ?? derived.atlassianAuthUrl,
    atlassianApiUrl: config.atlassianApiUrl ?? derived.atlassianApiUrl,
    xrayBaseUrl: config.xrayBaseUrl ?? derived.xrayBaseUrl,
    mockJiraSiteUrl: derived.mockJiraSiteUrl,
  }
}
