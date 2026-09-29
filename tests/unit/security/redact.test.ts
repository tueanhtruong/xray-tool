import { describe, expect, it } from 'vitest'
import { SENSITIVE_KEYS, redactValue, scrubString } from '#shared/security/redact'
import { SecretString } from '#shared/security/secret-string'

const json = (value: unknown, secrets?: string[]) => JSON.stringify(redactValue(value, { secrets }))

describe('key redaction', () => {
  it('redacts nested headers and body (story scenario)', () => {
    const text = json({ headers: { Authorization: 'Bearer abc' }, body: { clientSecret: 'xyz' } })
    expect(text).toContain('[REDACTED]')
    expect(text).not.toContain('abc')
    expect(text).not.toContain('xyz')
  })

  it.each(SENSITIVE_KEYS)('redacts %s in camel, snake, kebab, upper and lower forms', (key) => {
    const words = key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(' ')
    const spellings = [
      key,
      key.toUpperCase(),
      key.toLowerCase(),
      words.join('_'),
      words.join('-'),
      words.join('_').toUpperCase(),
    ]
    for (const spelling of spellings) {
      const out = redactValue({ [spelling]: 'sentinel-value' }) as Record<string, unknown>
      expect(out[spelling], spelling).toBe('[REDACTED]')
    }
  })

  it('redacts snake_case upstream payloads', () => {
    const text = json({ access_token: 'tok1', refresh_token: 'tok2', 'x-api-key': 'k3' })
    for (const leaked of ['tok1', 'tok2', 'k3']) expect(text).not.toContain(leaked)
  })

  it('replaces a whole sensitive subtree, not just strings', () => {
    const out = redactValue({ credentials: { user: 'u', pass: 'p' } }) as Record<string, unknown>
    expect(out.credentials).toBe('[REDACTED]')
  })

  it('does not redact look-alike keys', () => {
    const out = redactValue({ tokenCount: 3, secretary: 'ann', codeOwner: 'bob' }) as Record<
      string,
      unknown
    >
    expect(out).toEqual({ tokenCount: 3, secretary: 'ann', codeOwner: 'bob' })
  })

  it('redacts inside arrays and keeps other items', () => {
    const text = json({ items: [{ password: 'p1' }, { ok: true }] })
    expect(text).not.toContain('p1')
    expect(text).toContain('ok')
  })

  it('redacts SecretString instances wherever they appear', () => {
    const out = redactValue({ a: new SecretString('leak-me'), b: [new SecretString('leak-me-2')] })
    expect(JSON.stringify(out)).not.toContain('leak-me')
  })

  it('redacts sensitive keys inside Map entries', () => {
    const text = json({
      m: new Map([
        ['password', 'p1'],
        ['ok', 'fine'],
      ]),
    })
    expect(text).not.toContain('p1')
    expect(text).toContain('fine')
  })
})

describe('Error handling', () => {
  it('serializes name, message, stack', () => {
    const out = redactValue(new TypeError('bad')) as Record<string, unknown>
    expect(out.name).toBe('TypeError')
    expect(out.message).toBe('bad')
    expect(typeof out.stack).toBe('string')
  })

  it('redacts secrets on the cause chain', () => {
    const cause = Object.assign(new Error('inner'), { token: 'cause-token-123' })
    const error = new Error('outer', { cause })
    const text = json(error)
    expect(text).not.toContain('cause-token-123')
    expect(text).toContain('inner')
  })

  it('redacts secrets in AggregateError members', () => {
    const inner = Object.assign(new Error('one'), { password: 'agg-pass-1' })
    expect(json(new AggregateError([inner], 'many'))).not.toContain('agg-pass-1')
  })

  it('keeps an error code under errorCode even though `code` is a denied key', () => {
    const error = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })
    const out = redactValue(error) as Record<string, unknown>
    expect(out.errorCode).toBe('ECONNREFUSED')
    expect(out).not.toHaveProperty('code')
  })

  it('redacts a plain `code` field (OAuth callback code)', () => {
    expect(json({ code: 'oauth-code-abc' })).not.toContain('oauth-code-abc')
  })
})

describe('value scrubbing', () => {
  it('scrubs a bearer credential inside an error message', () => {
    const text = json(new Error('upstream said: Bearer abc.def.ghi rejected'))
    expect(text).not.toContain('abc.def.ghi')
    expect(text).toContain('rejected')
  })

  it('scrubs JWT-shaped tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl'
    expect(scrubString(`token=${jwt};`)).not.toContain(jwt)
  })

  it('scrubs basic credentials', () => {
    expect(scrubString('Authorization: Basic dXNlcjpwYXNzd29yZA==')).not.toContain(
      'dXNlcjpwYXNzd29yZA',
    )
  })

  it('scrubs Atlassian API tokens', () => {
    const token = 'ATATT3xFfGF0abcdefghijklmnopqrstuvwxyz0123456789=1A2B3C4D'
    expect(json(new Error(`Jira said 401 for ${token}`))).not.toContain(token)
  })

  it('scrubs credentials embedded in URLs', () => {
    const text = json(
      new Error('connect failed: postgresql://leak-user:leak-pass@db.internal:5432/app'),
    )
    expect(text).not.toContain('leak-user')
    expect(text).not.toContain('leak-pass')
    expect(text).toContain('db.internal')
  })

  it('leaves URLs without credentials alone', () => {
    expect(scrubString('see https://example.com:8080/path?x=1')).toBe(
      'see https://example.com:8080/path?x=1',
    )
  })

  it('scrubs registered literal secrets from arbitrary strings', () => {
    const secret = 'super-client-secret-value'
    const text = json({ note: `oops ${secret} leaked` }, [secret])
    expect(text).not.toContain(secret)
  })

  it('ignores registered secrets that are too short to be safe to scrub', () => {
    expect(scrubString('a short abc word', { secrets: ['abc'] })).toBe('a short abc word')
  })

  it('leaves ordinary text alone', () => {
    expect(scrubString('Summary is required')).toBe('Summary is required')
  })
})

describe('robustness', () => {
  it('handles circular references', () => {
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    a.list = [a]
    const out = redactValue(a) as Record<string, unknown>
    expect(out.self).toBe('[Circular]')
    expect(() => JSON.stringify(out)).not.toThrow()
  })

  it('does not flag a shared (non-circular) reference as circular', () => {
    const shared = { v: 1 }
    const out = redactValue({ a: shared, b: shared }) as Record<string, unknown>
    expect(out).toEqual({ a: { v: 1 }, b: { v: 1 } })
  })

  it('truncates deep structures', () => {
    let deep: Record<string, unknown> = { leaf: true }
    for (let i = 0; i < 30; i++) deep = { next: deep }
    const text = json(deep)
    expect(text).toContain('[Truncated]')
    expect(text).not.toContain('leaf')
  })

  it('truncates long strings and long arrays', () => {
    const out = redactValue({
      s: 'x'.repeat(20_000),
      a: Array.from({ length: 500 }, (_, i) => i),
    }) as {
      s: string
      a: unknown[]
    }
    expect(out.s.length).toBeLessThan(9_000)
    expect(out.s).toContain('truncated')
    expect(out.a.length).toBe(201)
  })

  it('summarizes binary data instead of printing it', () => {
    const out = redactValue({ b: Buffer.from('secret-bytes'), u: new Uint8Array(4) }) as Record<
      string,
      unknown
    >
    expect(out.b).toBe('[Binary 12 bytes]')
    expect(out.u).toBe('[Binary 4 bytes]')
  })

  it('survives throwing getters and proxies', () => {
    const obj = {
      get boom(): string {
        throw new Error('getter exploded')
      },
      ok: 1,
    }
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('nope')
        },
      },
    )
    const out = redactValue({ obj, hostile }) as Record<string, unknown>
    expect(out.obj).toEqual({ boom: '[Unreadable]', ok: 1 })
    expect(out.hostile).toEqual({})
  })

  it('handles bigint, symbols, functions, dates, and undefined', () => {
    const out = redactValue({
      n: 10n,
      s: Symbol('x'),
      f: () => 1,
      d: new Date(0),
      u: undefined,
    }) as Record<string, unknown>
    expect(out).toEqual({ n: '10', d: '1970-01-01T00:00:00.000Z' })
  })

  it('does not pollute prototypes via __proto__ keys', () => {
    const payload = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}')
    const out = redactValue(payload) as Record<string, unknown>
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.keys(out)).toContain('__proto__')
  })

  it('never mutates the input', () => {
    const input = { password: 'keep-me', nested: { token: 't', list: [{ secret: 's' }] } }
    const snapshot = structuredClone(input)
    redactValue(input)
    expect(input).toEqual(snapshot)
  })

  it('passes through primitives', () => {
    expect(redactValue('hi')).toBe('hi')
    expect(redactValue(3)).toBe(3)
    expect(redactValue(null)).toBeNull()
    expect(redactValue(undefined)).toBeUndefined()
  })
})
