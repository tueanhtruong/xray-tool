import { REDACTED, SecretString } from './secret-string'

/**
 * Deny-list redaction for log entries. Pure: no Node or framework imports.
 *
 * Keys are compared after lowercasing and removing `_` and `-`, so `Authorization`,
 * `client_secret`, `access_token` and `x-api-key` all match without listing every spelling.
 * Matching is exact (not substring) so `tokenCount` or `secretary` are left alone.
 */
const SENSITIVE_KEY_LIST = [
  'authorization',
  'proxyAuthorization',
  'cookie',
  'setCookie',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'apiToken',
  'apiKey',
  'xApiKey',
  'clientSecret',
  'secret',
  'jwt',
  'privateKey',
  'encryptionKey',
  'credentials',
  'code',
] as const

export const SENSITIVE_KEYS: readonly string[] = SENSITIVE_KEY_LIST

const normalizeKey = (key: string) => key.toLowerCase().replace(/[_-]/g, '')

const DENIED = new Set<string>(SENSITIVE_KEY_LIST.map(normalizeKey))

export function isSensitiveKey(key: string): boolean {
  return DENIED.has(normalizeKey(key))
}

export const MAX_DEPTH = 8
export const MAX_STRING_LENGTH = 8 * 1024
export const MAX_ARRAY_LENGTH = 200
/** Registered literal secrets shorter than this are ignored so common words are not scrubbed. */
export const MIN_SECRET_LENGTH = 8

const VALUE_PATTERNS: readonly [RegExp, string][] = [
  [/\bBearer\s+[^\s"',;]+/gi, `Bearer ${REDACTED}`],
  [/\bBasic\s+[A-Za-z0-9+/=]{8,}/g, `Basic ${REDACTED}`],
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED],
  // Atlassian API tokens (https://id.atlassian.com/manage-profile/security/api-tokens)
  [/\bATATT[\w=-]{16,}/g, REDACTED],
  // Credentials embedded in URLs, e.g. postgresql://user:password@host/db
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${REDACTED}@`],
]

export interface RedactOptions {
  /** Literal secret values to remove wherever they appear inside strings. */
  secrets?: readonly string[]
}

/** Remove bearer/basic credentials, JWT-shaped tokens, and registered literal secrets. */
export function scrubString(input: string, options: RedactOptions = {}): string {
  let out = input
  for (const [pattern, replacement] of VALUE_PATTERNS) out = out.replace(pattern, replacement)
  for (const secret of options.secrets ?? []) {
    if (secret.length >= MIN_SECRET_LENGTH) out = out.split(secret).join(REDACTED)
  }
  return out
}

function cleanString(input: string, options: RedactOptions): string {
  const scrubbed = scrubString(input, options)
  if (scrubbed.length <= MAX_STRING_LENGTH) return scrubbed
  return `${scrubbed.slice(0, MAX_STRING_LENGTH)}...[truncated ${scrubbed.length - MAX_STRING_LENGTH} chars]`
}

type Ancestors = WeakSet<object>

function setProp(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) return
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

function readProp(source: object, key: string): unknown {
  try {
    return (source as Record<string, unknown>)[key]
  } catch {
    return '[Unreadable]'
  }
}

function ownKeys(source: object): string[] {
  try {
    return Object.keys(source)
  } catch {
    return []
  }
}

function walkProps(
  source: object,
  target: Record<string, unknown>,
  depth: number,
  ancestors: Ancestors,
  options: RedactOptions,
  skip: ReadonlySet<string> = new Set(),
): void {
  for (const key of ownKeys(source)) {
    if (skip.has(key)) continue
    setProp(
      target,
      key,
      isSensitiveKey(key) ? REDACTED : walk(readProp(source, key), depth + 1, ancestors, options),
    )
  }
}

function walkError(
  error: Error,
  depth: number,
  ancestors: Ancestors,
  options: RedactOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null)
  setProp(out, 'name', cleanString(String(error.name), options))
  setProp(out, 'message', cleanString(String(error.message), options))
  if (typeof error.stack === 'string') setProp(out, 'stack', cleanString(error.stack, options))
  const code = readProp(error, 'code')
  if (typeof code === 'string' || typeof code === 'number') {
    // `code` is a denied key for arbitrary objects (OAuth codes); error codes are diagnostic.
    setProp(out, 'errorCode', walk(code, depth + 1, ancestors, options))
  }
  if ('cause' in error)
    setProp(out, 'cause', walk(readProp(error, 'cause'), depth + 1, ancestors, options))
  if (error instanceof AggregateError) {
    setProp(out, 'errors', walk(error.errors, depth + 1, ancestors, options))
  }
  walkProps(
    error,
    out,
    depth,
    ancestors,
    options,
    new Set(['name', 'message', 'stack', 'cause', 'code', 'errors']),
  )
  return out
}

function walk(
  value: unknown,
  depth: number,
  ancestors: Ancestors,
  options: RedactOptions,
): unknown {
  if (value === null || value === undefined) return value
  switch (typeof value) {
    case 'string':
      return cleanString(value, options)
    case 'number':
    case 'boolean':
      return value
    case 'bigint':
      return value.toString()
    case 'symbol':
    case 'function':
      return undefined
  }

  const obj = value as object
  if (obj instanceof SecretString) return REDACTED
  if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? 'Invalid Date' : obj.toISOString()
  if (ArrayBuffer.isView(obj)) return `[Binary ${obj.byteLength} bytes]`
  if (obj instanceof ArrayBuffer) return `[Binary ${obj.byteLength} bytes]`

  if (ancestors.has(obj)) return '[Circular]'
  if (depth >= MAX_DEPTH) return '[Truncated]'

  ancestors.add(obj)
  try {
    if (obj instanceof Error) return walkError(obj, depth, ancestors, options)

    if (Array.isArray(obj) || obj instanceof Set) {
      const items = Array.from(obj as Iterable<unknown>)
      const out = items
        .slice(0, MAX_ARRAY_LENGTH)
        .map((item) => walk(item, depth + 1, ancestors, options))
      if (items.length > MAX_ARRAY_LENGTH) out.push(`[+${items.length - MAX_ARRAY_LENGTH} more]`)
      return out
    }

    if (obj instanceof Map) {
      const entries = Array.from(obj.entries()).slice(0, MAX_ARRAY_LENGTH)
      return entries.map(([k, v]) => [
        walk(k, depth + 1, ancestors, options),
        typeof k === 'string' && isSensitiveKey(k)
          ? REDACTED
          : walk(v, depth + 1, ancestors, options),
      ])
    }

    const out: Record<string, unknown> = Object.create(null)
    walkProps(obj, out, depth, ancestors, options)
    return out
  } finally {
    ancestors.delete(obj)
  }
}

/**
 * Returns a JSON-safe copy of `value` with sensitive keys replaced by `[REDACTED]` and secrets
 * scrubbed from strings. Never mutates the input and never throws for odd shapes: cycles become
 * `[Circular]`, structures deeper than 8 levels become `[Truncated]`.
 */
export function redactValue(value: unknown, options: RedactOptions = {}): unknown {
  return walk(value, 0, new WeakSet(), options)
}
