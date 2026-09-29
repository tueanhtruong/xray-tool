import { scrubString } from './redact'

/** The only body clients ever receive for a failed request. */
export interface ClientErrorBody {
  statusCode: number
  message: string
  requestId: string
}

export interface ClientError {
  statusCode: number
  body: ClientErrorBody
}

const GENERIC_MESSAGES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
}

export function genericMessage(statusCode: number): string {
  const known = GENERIC_MESSAGES[statusCode]
  if (known) return known
  return statusCode < 500 ? 'Bad Request' : 'Internal Server Error'
}

/**
 * Errors raised on purpose by application code (see `httpError`) carry `data.expose === true`.
 * Only those may show their own message to the client, and only for client errors (< 500).
 */
export const EXPOSE_KEY = 'expose'

function readStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null) return 500
  const record = error as Record<string, unknown>
  const status = record.statusCode ?? record.status
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : 500
}

function isExposed(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const data = (error as { data?: unknown }).data
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>)[EXPOSE_KEY] === true
  )
}

/**
 * Maps any thrown value to what the client may see. Stack traces, causes, `data`, upstream
 * bodies and the original message of unexpected errors never appear in the result.
 */
export function toClientError(error: unknown, context: { requestId: string }): ClientError {
  const statusCode = readStatus(error)
  let message = genericMessage(statusCode)
  if (statusCode < 500 && isExposed(error)) {
    const own = (error as { message?: unknown }).message
    if (typeof own === 'string' && own.trim() !== '') message = scrubString(own)
  }
  return { statusCode, body: { statusCode, message, requestId: context.requestId } }
}
