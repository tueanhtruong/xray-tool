import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger, registerSecret } from '~~/server/utils/logger'

let lines: string[]

beforeEach(() => {
  lines = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk))
    return true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const parsed = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>)

describe('logger output', () => {
  it('writes exactly one JSON line with time, level and msg', () => {
    logger.info('hello', { a: 1 })
    expect(lines).toHaveLength(1)
    expect(lines[0]!.endsWith('\n')).toBe(true)
    expect(lines[0]!.trim().split('\n')).toHaveLength(1)
    const entry = parsed()[0]!
    expect(entry).toMatchObject({ level: 'info', msg: 'hello', a: 1 })
    expect(Number.isNaN(Date.parse(entry.time as string))).toBe(false)
  })

  it('keeps multi-line values on one line', () => {
    logger.info('line1\nline2', { text: 'a\nb' })
    expect(lines[0]!.trim().split('\n')).toHaveLength(1)
  })

  it('redacts secrets at any depth (story scenario)', () => {
    logger.info('req', { headers: { Authorization: 'Bearer abc' }, body: { clientSecret: 'xyz' } })
    expect(lines[0]).toContain('[REDACTED]')
    expect(lines[0]).not.toContain('abc')
    expect(lines[0]).not.toContain('xyz')
  })

  it('redacts errors passed as fields, including their cause chain', () => {
    const cause = Object.assign(new Error('inner'), { token: 'cause-token-value' })
    logger.error('failed', { err: new Error('outer Bearer abc.def.ghi', { cause }) })
    expect(lines[0]).not.toContain('cause-token-value')
    expect(lines[0]).not.toContain('abc.def.ghi')
    expect(lines[0]).toContain('inner')
  })

  it('scrubs registered secrets from any string', () => {
    registerSecret('registered-secret-value-1')
    logger.info('note registered-secret-value-1 here', { other: 'x registered-secret-value-1 y' })
    expect(lines[0]).not.toContain('registered-secret-value-1')
  })

  it('does not throw on circular fields', () => {
    const a: Record<string, unknown> = {}
    a.self = a
    expect(() => logger.info('cycle', { a })).not.toThrow()
    expect(lines).toHaveLength(1)
  })

  it('reserved keys cannot be overwritten by caller fields', () => {
    logger.info('real message', { msg: 'fake', level: 'debug', requestId: 'forged-id-123' })
    expect(parsed()[0]).toMatchObject({ msg: 'real message', level: 'info' })
    expect(parsed()[0]).not.toHaveProperty('requestId')
  })
})

describe('request ID', () => {
  it('is omitted outside a request', () => {
    logger.info('startup')
    expect(parsed()[0]).not.toHaveProperty('requestId')
  })

  it('is attached automatically inside a request', () => {
    vi.stubGlobal('useEvent', () => ({ context: { requestId: 'req-12345678' } }))
    logger.info('inside')
    expect(parsed()[0]).toMatchObject({ requestId: 'req-12345678' })
  })
})

describe('levels', () => {
  it('writes debug in development but not in production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    logger.debug('dev')
    expect(lines).toHaveLength(1)
    vi.stubEnv('NODE_ENV', 'production')
    logger.debug('prod')
    expect(lines).toHaveLength(1)
  })

  it.each(['info', 'warn', 'error'] as const)('writes %s in production', (level) => {
    vi.stubEnv('NODE_ENV', 'production')
    logger[level]('m')
    expect(parsed()[0]).toMatchObject({ level })
  })
})
