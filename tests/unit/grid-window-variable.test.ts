import { describe, expect, it } from 'vitest'
import { calculateVariableWindow } from '../../shared/drafts/grid-window'

describe('variable-height grid window', () => {
  it('starts at the first row under the scroll position with overscan', () => {
    const heights = Array.from({ length: 50 }, () => 72)
    expect(calculateVariableWindow(heights, 720, 360, 2)).toEqual({
      start: 8,
      end: 17,
      topSpacer: 576,
      bottomSpacer: 33 * 72,
    })
  })

  it('keeps rows below an expanded row at their measured offsets', () => {
    const heights = [72, 400, 72, 72]
    const window = calculateVariableWindow(heights, 100, 200, 0)
    expect(window.start).toBe(1)
    expect(window.topSpacer).toBe(72)
    expect(
      window.topSpacer +
        heights.slice(window.start, window.end).reduce((sum, h) => sum + h, 0) +
        window.bottomSpacer,
    ).toBe(heights.reduce((sum, h) => sum + h, 0))
  })
})
