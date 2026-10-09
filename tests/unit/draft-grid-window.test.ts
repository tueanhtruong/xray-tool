import { describe, expect, it } from 'vitest'
import { calculateGridWindow, findEditableRow } from '../../shared/drafts/grid-window'

describe('draft grid window', () => {
  it('renders only a bounded visible range from 1,000 rows', () => {
    const window = calculateGridWindow(1_000, 50_000, 50, 12, 5)
    expect(window).toEqual({ start: 978, end: 1_000, topSpacer: 48_900, bottomSpacer: 0 })
    expect(window.end - window.start).toBeLessThanOrEqual(22)
  })

  it('keeps window boundaries within the row set', () => {
    expect(calculateGridWindow(20, 0, 50, 10, 4)).toEqual({
      start: 0, end: 18, topSpacer: 0, bottomSpacer: 100,
    })
    expect(calculateGridWindow(20, 10_000, 50, 10, 4)).toEqual({
      start: 2, end: 20, topSpacer: 100, bottomSpacer: 0,
    })
  })

  it('skips locked rows while preserving keyboard movement direction', () => {
    const rows = ['a', 'b', 'c', 'd', 'e']
    const editable = new Set(['a', 'd', 'e'])
    expect(findEditableRow(rows, editable, 0, 1)).toBe(3)
    expect(findEditableRow(rows, editable, 4, -1)).toBe(3)
    expect(findEditableRow(rows, new Set(['a']), 0, -1)).toBeNull()
  })
})
