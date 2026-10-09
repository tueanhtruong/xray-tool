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
  const start = Math.min(maxStart, Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight) - overscan))
  const end = Math.min(totalRows, start + viewportRows + overscan * 2)
  return {
    start,
    end,
    topSpacer: start * rowHeight,
    bottomSpacer: Math.max(0, (totalRows - end) * rowHeight),
  }
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
