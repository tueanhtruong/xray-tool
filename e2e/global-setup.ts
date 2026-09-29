import { loadEnv } from '../tests/support/env'
import { assertSafeTestDatabaseUrl, resetTestDatabase } from '../tests/support/test-db'

/** Reset the test database before the e2e run (same safety rules as `pnpm test:int`). */
export default async function globalSetup() {
  loadEnv()
  const devUrl = process.env.NUXT_DATABASE_URL
  const testUrl = assertSafeTestDatabaseUrl(process.env.NUXT_DATABASE_URL_TEST, devUrl)
  await resetTestDatabase(testUrl, devUrl)
}
