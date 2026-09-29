import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DecryptionError,
  EncryptionKeyError,
  decryptSecret,
  encryptSecret,
} from '~~/server/utils/crypto'

const KEY_A = randomBytes(32).toString('base64')
const KEY_B = randomBytes(32).toString('base64')

function useKey(encryptionKey: string) {
  vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey }))
}

/** Flip one byte of a base64url part by decoding, changing, and re-encoding it. */
function tamper(blob: string, partIndex: number): string {
  const parts = blob.split(':')
  const bytes = Buffer.from(parts[partIndex]!, 'base64url')
  bytes[0] = bytes[0]! ^ 0xff
  parts[partIndex] = bytes.toString('base64url')
  return parts.join(':')
}

beforeEach(() => useKey(KEY_A))
afterEach(() => vi.unstubAllGlobals())

describe('round trip', () => {
  it('encrypts and decrypts', () => {
    expect(decryptSecret(encryptSecret('s3cr3t'))).toBe('s3cr3t')
  })

  it('handles unicode and long values', () => {
    for (const value of ['pässwörd-日本語-🔐', 'x'.repeat(10_000), '', 'a:b:c']) {
      expect(decryptSecret(encryptSecret(value))).toBe(value)
    }
  })

  it('produces different ciphertext for the same plaintext', () => {
    expect(encryptSecret('s3cr3t')).not.toBe(encryptSecret('s3cr3t'))
  })
})

describe('stored format', () => {
  it('is v1:<keyId>:<iv>:<tag>:<ciphertext> without the plaintext in it', () => {
    const blob = encryptSecret('s3cr3t-plaintext')
    const parts = blob.split(':')
    expect(parts).toHaveLength(5)
    expect(parts[0]).toBe('v1')
    expect(parts[1]).toMatch(/^[0-9a-f]{8}$/)
    expect(Buffer.from(parts[2]!, 'base64url')).toHaveLength(12)
    expect(Buffer.from(parts[3]!, 'base64url')).toHaveLength(16)
    for (const part of parts.slice(2)) expect(part).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(blob).not.toContain('s3cr3t-plaintext')
  })

  it('keyId is stable for a key and differs between keys, and never contains the key', () => {
    const idA = encryptSecret('x').split(':')[1]
    expect(encryptSecret('y').split(':')[1]).toBe(idA)
    useKey(KEY_B)
    expect(encryptSecret('x').split(':')[1]).not.toBe(idA)
    expect(KEY_A).not.toContain(idA!)
  })

  it('rejects an unknown version', () => {
    const blob = encryptSecret('x').replace(/^v1/, 'v9')
    expect(() => decryptSecret(blob)).toThrow(DecryptionError)
    expect(() => decryptSecret(blob)).toThrow(/version/)
  })

  it('rejects a value encrypted with another key', () => {
    const blob = encryptSecret('x')
    useKey(KEY_B)
    expect(() => decryptSecret(blob)).toThrow(DecryptionError)
    expect(() => decryptSecret(blob)).toThrow(/different key/)
  })
})

describe('tampering and malformed input', () => {
  it.each([2, 3, 4])('rejects a changed byte in part %i', (index) => {
    const blob = tamper(encryptSecret('the-plaintext-value'), index)
    expect(() => decryptSecret(blob)).toThrow(DecryptionError)
  })

  it('rejects a changed key id', () => {
    const parts = encryptSecret('x').split(':')
    parts[1] = '00000000'
    expect(() => decryptSecret(parts.join(':'))).toThrow(DecryptionError)
  })

  it('rejects truncated ciphertext and truncated tag', () => {
    const parts = encryptSecret('some longer plaintext').split(':')
    const truncatedCt = [...parts.slice(0, 4), parts[4]!.slice(0, -4)].join(':')
    const truncatedTag = [...parts.slice(0, 3), parts[3]!.slice(0, -4), parts[4]].join(':')
    expect(() => decryptSecret(truncatedCt)).toThrow(DecryptionError)
    expect(() => decryptSecret(truncatedTag)).toThrow(DecryptionError)
  })

  it.each(['', 'not-a-blob', 'v1:only:three', 'v1:a:b:c:d:e', 'v1::::', 'v1:abcdef01:!!!:???:###'])(
    'reports %j as a DecryptionError, not an unrelated exception',
    (value) => {
      expect(() => decryptSecret(value)).toThrow(DecryptionError)
    },
  )

  it('rejects non-canonical base64url spellings', () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const parts = encryptSecret('x').split(':')
    const ct = parts[4]! // 1 byte -> 2 characters; the last one has 4 unused low bits
    expect(ct).toHaveLength(2)
    const alt = ct[0]! + alphabet[alphabet.indexOf(ct[1]!) ^ 1]!
    expect(Buffer.from(alt, 'base64url')).toEqual(Buffer.from(ct, 'base64url'))
    expect(() => decryptSecret([...parts.slice(0, 4), alt].join(':'))).toThrow(DecryptionError)
  })

  it('error messages never contain the plaintext, key, or ciphertext', () => {
    const plaintext = 'the-plaintext-value-9f3a'
    const blob = encryptSecret(plaintext)
    const bad = tamper(blob, 4)
    let error: unknown
    try {
      decryptSecret(bad)
    } catch (e) {
      error = e
    }
    const text = `${(error as Error).message} ${(error as Error).stack} ${JSON.stringify(error)}`
    expect(text).not.toContain(plaintext)
    expect(text).not.toContain(KEY_A)
    expect((error as Error).cause).toBeUndefined()
  })
})

describe('context binding', () => {
  it('accepts a matching context', () => {
    expect(decryptSecret(encryptSecret('s', { context: 'a' }), { context: 'a' })).toBe('s')
  })

  it('rejects a different or missing context', () => {
    const blob = encryptSecret('s', { context: 'a' })
    expect(() => decryptSecret(blob, { context: 'b' })).toThrow(DecryptionError)
    expect(() => decryptSecret(blob)).toThrow(DecryptionError)
  })

  it('rejects a context supplied only at decrypt time', () => {
    expect(() => decryptSecret(encryptSecret('s'), { context: 'a' })).toThrow(DecryptionError)
  })
})

describe('missing or invalid key', () => {
  it.each(['', undefined, 'short', randomBytes(16).toString('base64')])(
    'fails clearly for key %j',
    (key) => {
      useKey(key as string)
      for (const run of [() => encryptSecret('x'), () => decryptSecret('v1:a:b:c:d')]) {
        expect(run).toThrow(EncryptionKeyError)
        expect(run).toThrow(/NUXT_ENCRYPTION_KEY/)
        expect(run).toThrow(/openssl rand -base64 32/)
      }
    },
  )
})
