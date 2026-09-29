import { config } from 'dotenv'

/** Load `.env` for test runners. Variables already set in the environment win. */
export function loadEnv(): void {
  config({ quiet: true })
}

export function integrationTarget(): string {
  return process.env.NUXT_INTEGRATION_TARGET || 'live'
}

export function mockServicesUrl(): string {
  return process.env.NUXT_MOCK_SERVICES_URL || 'http://localhost:4010'
}

/**
 * Fixed encryption key for tests only (32 bytes, base64). It protects nothing: it exists so
 * built-server tests do not depend on the developer's `.env`. Never use it outside tests.
 */
export const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 'test-only-key').toString('base64')
