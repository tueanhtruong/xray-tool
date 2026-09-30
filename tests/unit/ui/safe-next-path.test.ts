import { describe, expect, it } from 'vitest'
import { postLoginPath, safeNextPath } from '#shared/ui/safe-next-path'

describe('safeNextPath', () => {
  it.each(['/repository', '/repository?folder=/Autocomplete&q=x', '/tests/ONEDS-1', '/settings#a'])(
    'accepts %s',
    (value) => expect(safeNextPath(value)).toBe(value),
  )

  it.each([
    'https://evil.example/x',
    'http://evil.example',
    '//evil.example/x',
    '/\\evil.example',
    '\\\\evil.example',
    'repository',
    '',
    '/a\nb',
    '/a\rb',
    '/a\u0000b',
    '/javascript:alert(1)',
    '/' + 'a'.repeat(2048),
  ])('refuses %j', (value) => expect(safeNextPath(value)).toBeUndefined())

  it('refuses non-strings', () => {
    expect(safeNextPath(undefined)).toBeUndefined()
    expect(safeNextPath(['/a'])).toBeUndefined()
    expect(safeNextPath(42)).toBeUndefined()
  })

  it('accepts the maximum length', () => {
    const value = '/' + 'a'.repeat(2047)
    expect(safeNextPath(value)).toBe(value)
  })

  it('falls back to the repository', () => {
    expect(postLoginPath('https://evil.example')).toBe('/repository')
    expect(postLoginPath('/tests/X-1')).toBe('/tests/X-1')
    expect(postLoginPath(undefined)).toBe('/repository')
  })
})
