/**
 * Inbound `x-request-id` values are echoed in responses and written to logs, so only a
 * conservative alphabet and length are accepted. Anything else is replaced (log injection).
 * The pattern has no `m` flag, so `$` only matches at the true end of the value.
 */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/

/** True only for a single string header value that matches the whole pattern. */
export function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
}
