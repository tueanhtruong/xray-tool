import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ENCRYPTION_KEY_HELP, isValidEncryptionKey } from '#shared/security/encryption-key'

describe('isValidEncryptionKey', () => {
  it('accepts 32 random bytes as standard base64', () => {
    for (let i = 0; i < 200; i++) {
      expect(isValidEncryptionKey(randomBytes(32).toString('base64'))).toBe(true)
    }
  })

  it.each([
    ['16 bytes', randomBytes(16).toString('base64')],
    ['31 bytes', randomBytes(31).toString('base64')],
    ['33 bytes', randomBytes(33).toString('base64')],
    ['64 bytes', randomBytes(64).toString('base64')],
    ['not base64', 'not base64 !!!'],
    ['url-safe alphabet', randomBytes(32).toString('base64url')],
    ['missing padding', randomBytes(32).toString('base64').replace(/=+$/, '')],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(isValidEncryptionKey(value)).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isValidEncryptionKey(undefined)).toBe(false)
    expect(isValidEncryptionKey(32)).toBe(false)
  })

  it('help text says what is needed and how to generate it', () => {
    expect(ENCRYPTION_KEY_HELP).toContain('32-byte')
    expect(ENCRYPTION_KEY_HELP).toContain('openssl rand -base64 32')
  })
})
