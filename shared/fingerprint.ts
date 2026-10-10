/** Bump when the hashed fields change; the US-09.1 migration recomputes stored values with this version. */
export const FINGERPRINT_VERSION = 2

export interface FingerprintFields {
  summary: string
  gherkin: string | null
}

export function normalizeFingerprintFields(fields: FingerprintFields): FingerprintFields {
  return {
    summary: fields.summary.trim(),
    gherkin: fields.gherkin === null ? null : fields.gherkin.replace(/\r\n?/g, '\n').trim(),
  }
}

export async function fingerprintTestCase(fields: FingerprintFields): Promise<string> {
  const normalized = normalizeFingerprintFields(fields)
  const input = new TextEncoder().encode(
    JSON.stringify({ version: FINGERPRINT_VERSION, ...normalized }),
  )
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
