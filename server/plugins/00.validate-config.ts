import { parseServerConfig } from '#shared/config/schema'

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
})
