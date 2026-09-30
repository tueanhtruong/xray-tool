export interface FingerprintFields {
  summary: string
  labels: string[]
  status: string
  gherkin: string | null
}

export function normalizeFingerprintFields(fields: FingerprintFields): FingerprintFields {
  return {
    summary: fields.summary.trim(),
    labels: [...fields.labels].sort((left, right) => left.localeCompare(right)),
    status: fields.status.trim(),
    gherkin: fields.gherkin === null ? null : fields.gherkin.replace(/\r\n?/g, '\n').trim(),
  }
}

export async function fingerprintTestCase(fields: FingerprintFields): Promise<string> {
  const normalized = normalizeFingerprintFields(fields)
  const input = new TextEncoder().encode(JSON.stringify(normalized))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
