import { EXPOSE_KEY } from '#shared/security/client-error'

/**
 * An error carrying an HTTP status (< 500) and a message that is safe to show to the client.
 * Anything not built with this helper gets a generic message in the response.
 * Never put upstream response text or secrets in `message`.
 */
export class HttpError extends Error {
  readonly statusCode: number
  readonly data = { [EXPOSE_KEY]: true }

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
  }
}

export function httpError(statusCode: number, message: string): HttpError {
  return new HttpError(statusCode, message)
}
