import { genericMessage, toClientError } from '#shared/security/client-error'
import { logger } from './utils/logger'
import { assignRequestId, type RequestEventLike } from './utils/request-id'

/**
 * Nitro error handler (registered first in the chain by nuxt.config.ts).
 *
 * Every failed request is logged with full detail (redacted). For `/api/` requests the client
 * then gets exactly `{ statusCode, message, requestId }`. Other requests fall through to the
 * framework's own handler, which renders the Nuxt error page. Written against Node's
 * request/response so it does not depend on h3 helpers.
 */
function isApiPath(path: string): boolean {
  const pathname = path.split('?')[0] ?? ''
  return pathname === '/api' || pathname.startsWith('/api/')
}

export default function errorHandler(error: unknown, event: RequestEventLike): void {
  const requestId = assignRequestId(event)
  const { statusCode, body } = toClientError(error, { requestId })

  // Server errors keep everything (stack, cause chain) for debugging; client errors are routine
  // (unknown routes, validation) so only their message is logged.
  if (statusCode >= 500) {
    logger.error('request failed', { statusCode, err: error }, { requestId })
  } else {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('request failed', { statusCode, errorMessage: message }, { requestId })
  }

  const res = event.node.res
  const path = event.path ?? event.node.req.url ?? ''
  if (!isApiPath(path) || res.headersSent) return

  res.statusCode = statusCode
  // The status line must not carry the original (possibly sensitive) status text either.
  res.statusMessage = genericMessage(statusCode)
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(body))
}
