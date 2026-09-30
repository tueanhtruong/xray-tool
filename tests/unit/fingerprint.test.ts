import { describe, expect, it } from 'vitest'
import { fingerprintTestCase, normalizeFingerprintFields } from '../../shared/fingerprint'

describe('test-case fingerprint', () => {
  it('normalizes line endings and surrounding whitespace and sorts labels', () => {
    expect(normalizeFingerprintFields({
      summary: ' Summary ',
      labels: ['z', 'a'],
      status: ' Ready ',
      gherkin: '\r\n Scenario: example \r\n',
    })).toEqual({
      summary: 'Summary',
      labels: ['a', 'z'],
      status: 'Ready',
      gherkin: 'Scenario: example',
    })
  })

  it('produces a stable SHA-256 for equivalent normalized values', async () => {
    const first = await fingerprintTestCase({ summary: 'Test', labels: ['b', 'a'], status: 'Ready', gherkin: 'Scenario: one\r\n' })
    const second = await fingerprintTestCase({ summary: ' Test ', labels: ['a', 'b'], status: ' Ready ', gherkin: 'Scenario: one\n' })
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(second).toBe(first)
  })
})
