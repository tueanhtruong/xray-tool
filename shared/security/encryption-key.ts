export const ENCRYPTION_KEY_ENV = 'NUXT_ENCRYPTION_KEY'

export const ENCRYPTION_KEY_GENERATE_COMMAND = 'openssl rand -base64 32'

export const ENCRYPTION_KEY_HELP =
  `must be a 32-byte key encoded as standard base64 (44 characters). ` +
  `Generate one with: ${ENCRYPTION_KEY_GENERATE_COMMAND}`

/**
 * Standard base64 (with padding) of exactly 32 bytes: 42 free characters, one character whose
 * low 2 bits are zero (A E I M Q U Y c g k o s w 0 4 8), then `=`. Checking the shape here keeps
 * this module pure (no `Buffer`) and accepts exactly one spelling per key.
 */
const ENCRYPTION_KEY_PATTERN = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/

export function isValidEncryptionKey(value: unknown): value is string {
  return typeof value === 'string' && ENCRYPTION_KEY_PATTERN.test(value)
}
