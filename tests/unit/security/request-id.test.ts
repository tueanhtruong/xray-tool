import { describe, expect, it } from 'vitest'
import { isSafeRequestId } from '#shared/security/request-id'

describe('isSafeRequestId', () => {
  it.each(['abc12345', 'abc12345-def', 'A'.repeat(64), '123e4567-e89b-12d3-a456-426614174000'])(
    'accepts %s',
    (id) => {
      expect(isSafeRequestId(id)).toBe(true)
    },
  )

  it.each([
    ['too short', 'abc'],
    ['7 chars', 'abcdefg'],
    ['65 chars', 'a'.repeat(65)],
    ['space', 'abc 12345'],
    ['trailing newline', 'abc12345\n'],
    ['embedded CRLF', 'abc12345\r\nX-Injected: 1'],
    ['quote', 'abc12345"'],
    ['underscore', 'abc_12345'],
    ['comma-joined', 'abc12345,def67890'],
    ['unicode', 'abc12345é'],
    ['empty', ''],
  ])('rejects %s', (_label, id) => {
    expect(isSafeRequestId(id)).toBe(false)
  })

  it('rejects non-strings (repeated headers arrive as arrays)', () => {
    expect(isSafeRequestId(['abc12345', 'def67890'])).toBe(false)
    expect(isSafeRequestId(undefined)).toBe(false)
    expect(isSafeRequestId(12345678)).toBe(false)
  })
})
