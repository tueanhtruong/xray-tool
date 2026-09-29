import { z } from 'zod'
import { ENCRYPTION_KEY_HELP, isValidEncryptionKey } from '../security/encryption-key'

/**
 * Server runtime configuration contract. Pure: no Nuxt/Nitro imports, so it can
 * be unit-tested and reused. Keys match `runtimeConfig` in nuxt.config.ts; each
 * key `fooBar` is set by the env variable `NUXT_FOO_BAR`.
 */

export const INTEGRATION_TARGETS = ['live', 'mock'] as const
export type IntegrationTarget = (typeof INTEGRATION_TARGETS)[number]

export const DEFAULT_MOCK_SERVICES_URL = 'http://localhost:4010'

/** Nuxt runtimeConfig defaults are empty strings; treat them as "not set". */
const unset = (value: unknown) => (value === '' || value === null ? undefined : value)

const httpUrl = (example: string) =>
  z.url({
    protocol: /^https?$/,
    error: `must be an http(s) URL, e.g. ${example}`,
  })

const optionalHttpUrl = (example: string) => z.preprocess(unset, httpUrl(example).optional())
const optionalString = z.preprocess(unset, z.string().optional())

export const serverConfigSchema = z.object({
  databaseUrl: z.preprocess(
    unset,
    z.url({
      protocol: /^postgres(ql)?$/,
      error: (issue) =>
        issue.input === undefined
          ? 'is required'
          : 'must be a PostgreSQL URL, e.g. postgresql://user:password@localhost:5432/xray_dev',
    }),
  ),
  integrationTarget: z.preprocess(
    unset,
    z
      .enum(INTEGRATION_TARGETS, {
        error: `must be one of: ${INTEGRATION_TARGETS.join(', ')}`,
      })
      .default('live'),
  ),
  mockServicesUrl: z.preprocess(
    unset,
    httpUrl(DEFAULT_MOCK_SERVICES_URL).default(DEFAULT_MOCK_SERVICES_URL),
  ),
  atlassianAuthUrl: optionalHttpUrl('https://auth.atlassian.com'),
  atlassianApiUrl: optionalHttpUrl('https://api.atlassian.com'),
  xrayBaseUrl: optionalHttpUrl('https://xray.cloud.getxray.app'),
  atlassianClientId: optionalString,
  atlassianClientSecret: optionalString,
  atlassianRedirectUri: optionalHttpUrl('http://localhost:3000/auth/jira/callback'),
  sessionPassword: optionalString,
  // Optional: an unset key fails at first use. When set it must be a valid 32-byte base64 key.
  // The error text never includes the value.
  encryptionKey: z.preprocess(
    unset,
    z.string().refine(isValidEncryptionKey, { error: ENCRYPTION_KEY_HELP }).optional(),
  ),
})

export type ServerConfig = z.infer<typeof serverConfigSchema>

/** `databaseUrl` -> `NUXT_DATABASE_URL` (the Nuxt runtimeConfig env mapping). */
export function toEnvName(key: string): string {
  return `NUXT_${key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`
}

/** One actionable block naming every invalid variable by its env name. */
export function formatConfigError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '(root)'
    return `  - ${toEnvName(key)} ${issue.message}`
  })
  return [
    'Invalid server configuration:',
    ...lines,
    '',
    'Set these variables in .env (see .env.example for every variable, its format, and a default).',
  ].join('\n')
}

export type ParseServerConfigResult =
  { success: true; config: ServerConfig } | { success: false; message: string }

export function parseServerConfig(input: unknown): ParseServerConfigResult {
  const result = serverConfigSchema.safeParse(input)
  if (result.success) return { success: true, config: result.data }
  return { success: false, message: formatConfigError(result.error) }
}

export type JiraOAuthConfig = Pick<
  ServerConfig,
  'atlassianClientId' | 'atlassianClientSecret' | 'atlassianRedirectUri'
>

/** Missing OAuth values are checked at sign-in time, not at server startup. */
export function getMissingOAuthConfig(config: JiraOAuthConfig): string[] {
  const missing: string[] = []
  if (!config.atlassianClientId) missing.push('NUXT_ATLASSIAN_CLIENT_ID')
  if (!config.atlassianClientSecret) missing.push('NUXT_ATLASSIAN_CLIENT_SECRET')
  if (!config.atlassianRedirectUri) missing.push('NUXT_ATLASSIAN_REDIRECT_URI')
  return missing
}

export function isValidSessionPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 32
}

export function validateSessionPassword(value: unknown): string | undefined {
  return isValidSessionPassword(value)
    ? undefined
    : 'NUXT_SESSION_PASSWORD must contain at least 32 characters. See docs/setup-atlassian-oauth.md.'
}
