import { describe, expect, it } from 'vitest'
import { trimFolderPath } from '../../shared/drafts/folder-trim'

describe('folder path trimming', () => {
  it('keeps the leaf segment and trims from the start', () => {
    expect(trimFolderPath('/Brochures/Industry/Brochures Industry Page', 30)).toBe(
      '…/Brochures Industry Page',
    )
  })

  it('leaves a path that fits untouched', () => {
    expect(trimFolderPath('/Autocomplete', 30)).toBe('/Autocomplete')
  })

  it('keeps the leaf even when only the leaf fits', () => {
    expect(trimFolderPath('/a/b/c/very-long-leaf-name', 10)).toBe('…/very-long-leaf-name')
  })
})
