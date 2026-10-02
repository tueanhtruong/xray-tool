import { logger, registerSecret } from '../utils/logger'

/**
 * Registers configured secrets with the logger (so they are scrubbed even inside free text) and
 * writes one access-log entry per request: ID, method, path, query, status, and duration.
 * Query values are structured so sensitive keys can be redacted; bodies are never logged.
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
      const queryStart = event.path.indexOf('?')
      const query: Record<string, string | string[]> = Object.create(null)
      if (queryStart !== -1) {
        for (const [key, value] of new URLSearchParams(event.path.slice(queryStart + 1))) {
          const existing = query[key]
          if (existing === undefined) query[key] = value
          else if (Array.isArray(existing)) existing.push(value)
          else query[key] = [existing, value]
        }
      }
      logger.info(
        'request',
        {
          method: event.method,
          path: queryStart === -1 ? event.path : event.path.slice(0, queryStart),
          query: Object.keys(query).length > 0 ? query : undefined,
          status: event.node.res.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        },
        { requestId: typeof requestId === 'string' ? requestId : undefined },
      )
    })
  })
})
