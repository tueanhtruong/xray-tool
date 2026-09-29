import { parseServerConfig } from '#shared/config/schema'
import { logger } from '../utils/logger'

/**
 * Fail fast on invalid runtime configuration. Runs when the server starts
 * (never at build time). Throwing here makes the production server exit non-zero.
 */
export default defineNitroPlugin(() => {
  const result = parseServerConfig(useRuntimeConfig())
  if (!result.success) {
    console.error(result.message)
    throw new Error('Server configuration is invalid; see the message above.')
  }
  if (!result.config.encryptionKey) {
    logger.warn(
      'NUXT_ENCRYPTION_KEY is not set; saving Jira/Xray credentials will fail until it is. ' +
        'Generate one with: openssl rand -base64 32',
    )
  }
})
