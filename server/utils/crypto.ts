import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import {
  ENCRYPTION_KEY_ENV,
  ENCRYPTION_KEY_GENERATE_COMMAND,
  isValidEncryptionKey,
} from '#shared/security/encryption-key'

/**
 * Secret encryption at rest: AES-256-GCM, random 12-byte IV per call, auth tag verified on
 * decrypt. Stored form: `v1:<keyId>:<iv>:<tag>:<ciphertext>` (last three parts base64url).
 *
 * `keyId` is derived from the key, so it never disagrees with the configured key and a future
 * key ring can pick the right key. An optional `context` is authenticated but not stored: bind a
 * value to where it lives (e.g. `table:column:id`) so ciphertexts cannot be swapped between rows.
 */

const VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16
const BASE64URL = /^[A-Za-z0-9_-]*$/

export interface SecretOptions {
  /** Additional authenticated data; must be identical at encrypt and decrypt time. */
  context?: string
}

/** The stored value cannot be decrypted. Messages are fixed strings and never carry secrets. */
export class DecryptionError extends Error {
  constructor(reason: string) {
    super(`Cannot decrypt secret: ${reason}`)
    this.name = 'DecryptionError'
  }
}

/** No usable encryption key is configured. */
export class EncryptionKeyError extends Error {
  constructor() {
    super(
      `${ENCRYPTION_KEY_ENV} is not set to a valid key, so secrets cannot be encrypted or decrypted. ` +
        `Generate a 32-byte base64 key with: ${ENCRYPTION_KEY_GENERATE_COMMAND}`,
    )
    this.name = 'EncryptionKeyError'
  }
}

interface LoadedKey {
  source: string
  key: Buffer
  keyId: string
}

let loaded: LoadedKey | undefined

function loadKey(): LoadedKey {
  const source = useRuntimeConfig().encryptionKey
  if (typeof source !== 'string' || !isValidEncryptionKey(source)) throw new EncryptionKeyError()
  if (loaded?.source === source) return loaded
  const key = Buffer.from(source, 'base64')
  loaded = { source, key, keyId: createHash('sha256').update(key).digest('hex').slice(0, 8) }
  return loaded
}

function decodePart(part: string, expectedBytes?: number): Buffer {
  if (!BASE64URL.test(part)) throw new DecryptionError('malformed value')
  const bytes = Buffer.from(part, 'base64url')
  // Reject non-canonical encodings so every stored value has exactly one spelling.
  if (bytes.toString('base64url') !== part) throw new DecryptionError('malformed value')
  if (expectedBytes !== undefined && bytes.length !== expectedBytes) {
    throw new DecryptionError('malformed value')
  }
  return bytes
}

export function encryptSecret(plain: string, options: SecretOptions = {}): string {
  const { key, keyId } = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES })
  if (options.context !== undefined) cipher.setAAD(Buffer.from(options.context, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    VERSION,
    keyId,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export function decryptSecret(blob: string, options: SecretOptions = {}): string {
  const { key, keyId } = loadKey()
  const parts = typeof blob === 'string' ? blob.split(':') : []
  if (parts.length !== 5) throw new DecryptionError('malformed value')
  const [version, blobKeyId, ivPart, tagPart, ciphertextPart] = parts as [
    string,
    string,
    string,
    string,
    string,
  ]
  if (version !== VERSION) throw new DecryptionError('unsupported format version')
  if (blobKeyId !== keyId) throw new DecryptionError('value was encrypted with a different key')

  const iv = decodePart(ivPart, IV_BYTES)
  const tag = decodePart(tagPart, TAG_BYTES)
  const ciphertext = decodePart(ciphertextPart)

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES })
    decipher.setAuthTag(tag)
    if (options.context !== undefined) decipher.setAAD(Buffer.from(options.context, 'utf8'))
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Deliberately drops the OpenSSL error: it must not become a cause chain or a log line.
    throw new DecryptionError('value was altered or the context does not match')
  }
}
