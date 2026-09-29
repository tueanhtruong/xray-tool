import { redactValue } from '#shared/security/redact'
import { getRequestId } from './request-context'

/**
 * The only way server code writes logs. One JSON line per entry on stdout, with the current
 * request's ID attached automatically and every field passed through redaction.
 * (Startup failures may still use `console.error` before the logger is usable.)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

const registeredSecrets = new Set<string>()

/** Register a literal secret (e.g. the encryption key) so it is scrubbed wherever it appears. */
export function registerSecret(value: unknown): void {
  if (typeof value === 'string' && value !== '') registeredSecrets.add(value)
}

export interface LogOptions {
  /** For code that runs outside the request's async context (hooks, the error handler). */
  requestId?: string
}

function write(
  level: LogLevel,
  msg: string,
  fields: LogFields = {},
  options: LogOptions = {},
): void {
  if (level === 'debug' && process.env.NODE_ENV === 'production') return
  // Reserved keys come first and win: caller fields can never overwrite or forge them.
  const entry: LogFields = { time: new Date().toISOString(), level, msg }
  const requestId = options.requestId ?? getRequestId()
  if (requestId !== undefined) entry.requestId = requestId
  for (const [key, value] of Object.entries(fields)) {
    if (!(key in entry) && key !== 'requestId') entry[key] = value
  }
  const safe = redactValue(entry, { secrets: [...registeredSecrets] })
  process.stdout.write(`${JSON.stringify(safe)}\n`)
}

export const logger = {
  debug: (msg: string, fields?: LogFields, options?: LogOptions) =>
    write('debug', msg, fields, options),
  info: (msg: string, fields?: LogFields, options?: LogOptions) =>
    write('info', msg, fields, options),
  warn: (msg: string, fields?: LogFields, options?: LogOptions) =>
    write('warn', msg, fields, options),
  error: (msg: string, fields?: LogFields, options?: LogOptions) =>
    write('error', msg, fields, options),
}
