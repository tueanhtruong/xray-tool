import { describe, expect, it } from 'vitest'
import {
  composeDraftFields,
  diffDraftFields,
  hasDraftChanges,
  normalizeLabels,
  validateDraftFields,
} from '../../shared/drafts/rules'
import { calculateGridWindow } from '../../shared/drafts/grid-window'

const base = { summary: 'Original', labels: ['api', 'ui'], status: 'Ready' }

describe('draft rules', () => {
  it('normalizes and deduplicates labels', () => {
    expect(normalizeLabels([' ui ', 'api', 'ui', ''])).toEqual(['api', 'ui'])
  })

  it('validates required summary, summary length, labels, and allowed statuses', () => {
    expect(validateDraftFields({ summary: ' ', labels: ['needs review'], status: 'Unknown' }, ['Ready'])).toMatchObject({
      valid: false,
      errors: {
        summary: 'Summary is required.',
        labels: 'Jira labels cannot contain spaces',
        status: 'Choose a status available for the Test issue type.',
      },
    })
    expect(validateDraftFields({ summary: 'x'.repeat(256), labels: [], status: 'Ready' }, ['Ready']).errors.summary)
      .toBe('Summary must be 255 characters or fewer.')
  })

  it('composes nullable overrides over an immutable base', () => {
    expect(composeDraftFields(base, { summary: 'Changed', labels: null, status: 'To Do' })).toEqual({
      summary: 'Changed', labels: ['api', 'ui'], status: 'To Do',
    })
  })

  it('clears fields equal to base and identifies no-op drafts', () => {
    const overrides = diffDraftFields(base, { summary: 'Changed', labels: ['ui', 'api'], status: 'Ready' })
    expect(overrides).toEqual({ summary: 'Changed', labels: null, status: null })
    expect(hasDraftChanges(overrides)).toBe(true)
    expect(hasDraftChanges(diffDraftFields(base, base))).toBe(false)
  })

  it('virtualizes a thousand rows to the viewport window plus overscan', () => {
    const window = calculateGridWindow(1_000, 10_000, 50, 12, 5)
    expect(window).toEqual({ start: 195, end: 217, topSpacer: 9_750, bottomSpacer: 39_150 })
  })
})
