import { integrationTarget, loadEnv, mockServicesUrl } from '../../support/env'
import type { MockServicesHandle } from '../../support/mock-services'
import { startMockServices } from '../../support/mock-services'
import { assertSafeTestDatabaseUrl, resetTestDatabase } from '../../support/test-db'

/**
 * Runs once per `pnpm test:int`:
 * 1. load .env, 2. refuse unsafe test DB URLs, 3. reset the test DB,
 * 4. when the target is `mock`, start the mock (or reuse a running one).
 */
export default async function setup() {
  loadEnv()

  const devUrl = process.env.NUXT_DATABASE_URL
  const testUrl = assertSafeTestDatabaseUrl(process.env.NUXT_DATABASE_URL_TEST, devUrl)
  await resetTestDatabase(testUrl, devUrl)

  let mock: MockServicesHandle | undefined
  if (integrationTarget() === 'mock') {
    mock = await startMockServices(mockServicesUrl())
  }

  return async () => {
    await mock?.stop()
  }
}
