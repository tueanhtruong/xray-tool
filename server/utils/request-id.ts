import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isSafeRequestId } from '#shared/security/request-id'

/** The parts of an h3 event used here, so this works (and is testable) without h3. */
export interface RequestEventLike {
  node: { req: IncomingMessage; res: ServerResponse }
  context: Record<string, unknown>
  path?: string
}

export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Gives the request an ID (a safe inbound `x-request-id`, else a fresh UUID), stores it on
 * `event.context.requestId`, and sets it on the response. Idempotent: an event that already has
 * an ID keeps it. Also used by the error handler for errors raised before the middleware ran.
 */
export function assignRequestId(event: RequestEventLike): string {
  const existing = event.context.requestId
  let requestId: string
  if (typeof existing === 'string') {
    requestId = existing
  } else {
    const inbound = event.node.req.headers[REQUEST_ID_HEADER]
    requestId = isSafeRequestId(inbound) ? inbound : randomUUID()
    event.context.requestId = requestId
  }
  if (!event.node.res.headersSent) event.node.res.setHeader(REQUEST_ID_HEADER, requestId)
  return requestId
}
