import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv, mockServicesUrl } from '../support/env'
import type { MockServicesHandle } from '../support/mock-services'
import { isMockHealthy, startMockServices } from '../support/mock-services'

loadEnv()

const baseUrl = mockServicesUrl()

describe('mock services', () => {
  let mock: MockServicesHandle

  // With NUXT_INTEGRATION_TARGET=mock the global setup already started (or reused)
  // the mock; otherwise this starts one for the duration of the file.
  beforeAll(async () => {
    mock = await startMockServices(baseUrl)
  })
  afterAll(() => mock?.stop())

  it('GET /health returns 200 with status ok', async () => {
    const res = await fetch(new URL('/health', baseUrl))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', service: 'mock-services' })
  })

  it('returns 404 for an unimplemented route', async () => {
    const res = await fetch(new URL('/xray/anything', baseUrl))
    expect(res.status).toBe(404)
  })

  it('reuses an already-running mock and does not stop it', async () => {
    const second = await startMockServices(baseUrl)
    expect(second.started).toBe(false)
    await second.stop()
    expect(await isMockHealthy(baseUrl)).toBe(true)
  })
})
