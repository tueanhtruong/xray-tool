export interface GridWindow {
  start: number
  end: number
  topSpacer: number
  bottomSpacer: number
}

export function calculateGridWindow(
  totalRows: number,
  scrollTop: number,
  rowHeight: number,
  viewportRows: number,
  overscan: number,
): GridWindow {
  const maxStart = Math.max(0, totalRows - (viewportRows + overscan * 2))
  const start = Math.min(
    maxStart,
    Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight) - overscan),
  )
  const end = Math.min(totalRows, start + viewportRows + overscan * 2)
  return {
    start,
    end,
    topSpacer: start * rowHeight,
    bottomSpacer: Math.max(0, (totalRows - end) * rowHeight),
  }
}

/** Window over rows of individual heights, so expanded rows keep the rows below them in place. */
export function calculateVariableWindow(
  heights: readonly number[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): GridWindow {
  const total = heights.length
  const top = Math.max(0, scrollTop)
  const bottom = top + Math.max(0, viewportHeight)
  let first = 0
  let offset = 0
  while (first < total && offset + heights[first]! <= top) offset += heights[first++]!
  let last = first
  let edge = offset
  while (last < total && edge < bottom) edge += heights[last++]!
  const start = Math.max(0, first - overscan)
  const end = Math.min(total, last + overscan)
  let topSpacer = 0
  for (let index = 0; index < start; index += 1) topSpacer += heights[index]!
  let bottomSpacer = 0
  for (let index = end; index < total; index += 1) bottomSpacer += heights[index]!
  return { start, end, topSpacer, bottomSpacer }
}

export function findEditableRow(
  rowIds: readonly string[],
  editable: ReadonlySet<string>,
  from: number,
  direction: -1 | 1,
): number | null {
  for (let index = from + direction; index >= 0 && index < rowIds.length; index += direction) {
    if (editable.has(rowIds[index]!)) return index
  }
  return null
}
