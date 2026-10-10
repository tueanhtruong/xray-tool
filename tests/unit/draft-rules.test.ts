import { describe, expect, it } from 'vitest'
import {
  composeDraftFields,
  diffDraftFields,
  hasDraftChanges,
  validateDraftFields,
} from '../../shared/drafts/rules'
import { calculateGridWindow } from '../../shared/drafts/grid-window'

const base = { summary: 'Original', gherkin: 'Scenario: one' }

describe('draft rules', () => {
  it('validates required summary and summary length only', () => {
    expect(validateDraftFields({ summary: ' ', gherkin: null })).toMatchObject({
      valid: false,
      errors: { summary: 'Summary is required.' },
    })
    expect(validateDraftFields({ summary: 'x'.repeat(256), gherkin: null }).errors.summary).toBe(
      'Summary must be 255 characters or fewer.',
    )
    expect(validateDraftFields({ summary: 'Ok', gherkin: 'Scenario: two' })).toEqual({
      valid: true,
      errors: {},
    })
  })

  it('composes nullable overrides over an immutable base', () => {
    expect(composeDraftFields(base, { summary: 'Changed', gherkin: null })).toEqual({
      summary: 'Changed',
      gherkin: 'Scenario: one',
    })
    expect(composeDraftFields(base, { summary: null, gherkin: 'Scenario: two' })).toEqual({
      summary: 'Original',
      gherkin: 'Scenario: two',
    })
  })

  it('clears fields equal to base and identifies no-op drafts', () => {
    const overrides = diffDraftFields(base, { summary: 'Changed', gherkin: 'Scenario: one' })
    expect(overrides).toEqual({ summary: 'Changed', gherkin: null })
    expect(hasDraftChanges(overrides)).toBe(true)
    expect(hasDraftChanges(diffDraftFields(base, base))).toBe(false)
  })

  it('virtualizes a thousand rows to the viewport window plus overscan', () => {
    const window = calculateGridWindow(1_000, 10_000, 50, 12, 5)
    expect(window).toEqual({ start: 195, end: 217, topSpacer: 9_750, bottomSpacer: 39_150 })
  })
})
