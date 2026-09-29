import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimeoutError, withTimeout } from '~~/shared/utils/with-timeout'

afterEach(() => {
  vi.useRealTimers()
})

describe('withTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok')
  })

  it('passes through a rejection that happens in time', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom')
  })

  it('rejects with TimeoutError when the promise is too slow', async () => {
    vi.useFakeTimers()
    const never = new Promise<string>(() => {})
    const result = withTimeout(never, 2_000)
    vi.advanceTimersByTime(2_000)
    await expect(result).rejects.toBeInstanceOf(TimeoutError)
  })

  it('does not leave an unhandled rejection when the slow promise fails later', async () => {
    vi.useFakeTimers()
    let fail!: (e: Error) => void
    const slow = new Promise<string>((_, reject) => (fail = reject))
    const result = withTimeout(slow, 10)
    vi.advanceTimersByTime(10)
    await expect(result).rejects.toBeInstanceOf(TimeoutError)
    fail(new Error('late'))
    await Promise.resolve()
  })
})
