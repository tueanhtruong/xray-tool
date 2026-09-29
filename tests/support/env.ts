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
