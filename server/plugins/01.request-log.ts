import { logger, registerSecret } from '../utils/logger'

/**
 * Registers configured secrets with the logger (so they are scrubbed even inside free text) and
 * writes one access-log entry per request: ID, method, path without the query, status, duration.
 * Query strings and bodies are never logged (OAuth callbacks carry one-time codes there).
 */
export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  registerSecret(config.encryptionKey)
  registerSecret(config.atlassianClientSecret)

  // `finish` fires for every response, including error responses that h3's `afterResponse`
  // hook does not cover.
  nitroApp.hooks.hook('request', (event) => {
    const startedAt = performance.now()
    event.node.res.once('finish', () => {
      const requestId = event.context.requestId
      logger.info(
        'request',
        {
          method: event.method,
          path: event.path.split('?')[0],
          status: event.node.res.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        },
        { requestId: typeof requestId === 'string' ? requestId : undefined },
      )
    })
  })
})
