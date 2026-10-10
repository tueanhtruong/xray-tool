import { describe, expect, it } from 'vitest'
import {
  fingerprintTestCase,
  FINGERPRINT_VERSION,
  normalizeFingerprintFields,
} from '../../shared/fingerprint'

describe('test-case fingerprint', () => {
  it('normalizes line endings and surrounding whitespace of summary and Gherkin only', () => {
    expect(
      normalizeFingerprintFields({
        summary: ' Summary ',
        gherkin: '\r\n Scenario: example \r\n',
      }),
    ).toEqual({
      summary: 'Summary',
      gherkin: 'Scenario: example',
    })
  })

  it('produces a stable SHA-256 for equivalent normalized values', async () => {
    const first = await fingerprintTestCase({ summary: 'Test', gherkin: 'Scenario: one\r\n' })
    const second = await fingerprintTestCase({ summary: ' Test ', gherkin: 'Scenario: one\n' })
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(second).toBe(first)
  })

  it('pins version 2 so the migration recomputes stored values identically', async () => {
    expect(FINGERPRINT_VERSION).toBe(2)
    expect(await fingerprintTestCase({ summary: 'Test', gherkin: 'Scenario: one' })).toBe(
      '3d913640b52d30966b272ba135aec106da79324cab95595ecf8219f86bba8c89',
    )
  })
})
