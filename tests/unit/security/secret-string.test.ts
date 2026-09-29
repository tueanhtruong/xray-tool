import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { SecretString } from '#shared/security/secret-string'

describe('SecretString', () => {
  const secret = new SecretString('hunter2-value')

  it('redacts String(), template literals, and concatenation', () => {
    expect(String(secret)).toBe('[REDACTED]')
    expect(`${secret}`).toBe('[REDACTED]')
    expect('x' + secret).toBe('x[REDACTED]')
  })

  it('redacts JSON.stringify at any depth', () => {
    expect(JSON.stringify(secret)).toBe('"[REDACTED]"')
    expect(JSON.stringify({ a: { b: [secret] } })).toBe('{"a":{"b":["[REDACTED]"]}}')
  })

  it('redacts util.inspect (console.log / console.dir)', () => {
    expect(inspect(secret)).toBe('[REDACTED]')
    expect(inspect({ nested: secret })).not.toContain('hunter2')
  })

  it('exposes the value only through reveal()', () => {
    expect(secret.reveal()).toBe('hunter2-value')
    expect(Object.keys(secret)).toEqual([])
  })
})
