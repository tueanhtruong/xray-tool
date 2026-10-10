/** Start-trims a folder path to `maxLength`, keeping as many trailing segments as fit; the leaf is always kept. */
export function trimFolderPath(path: string, maxLength: number): string {
  if (path.length <= maxLength) return path
  const segments = path.split('/').filter(Boolean)
  const leaf = segments[segments.length - 1] ?? path
  let trimmed = `…/${leaf}`
  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const candidate = `…/${segments.slice(index).join('/')}`
    if (candidate.length > maxLength) break
    trimmed = candidate
  }
  return trimmed
}
