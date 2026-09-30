const MAX_LENGTH = 2048

/**
 * Returns the input only when it is a same-origin relative path that is safe to redirect to.
 * Anything else (absolute URLs, protocol-relative, backslashes, control characters) yields undefined.
 */
export function safeNextPath(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  if (input.length === 0 || input.length > MAX_LENGTH) return undefined
  if (!input.startsWith('/') || input.startsWith('//')) return undefined
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(input)) return undefined
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(input)) return undefined
  return input
}

/** Default destination after sign-in when no safe `next` was supplied. */
export const DEFAULT_POST_LOGIN_PATH = '/repository'

export function postLoginPath(next: unknown): string {
  return safeNextPath(next) ?? DEFAULT_POST_LOGIN_PATH
}
