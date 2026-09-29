import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { integrationTarget, loadEnv, mockServicesUrl } from './tests/support/env'

loadEnv()

const target = integrationTarget()
const mockUrl = mockServicesUrl()
const port = Number(process.env.E2E_PORT ?? 3100)
const baseURL = `http://127.0.0.1:${port}`
const reuse = !process.env.CI

if (!existsSync('.output/server/index.mjs')) {
  throw new Error(
    '.output/server/index.mjs not found. Build the app first with `pnpm build` ' +
      '(or `pnpm check`, which builds as its last step).',
  )
}

type WebServer = NonNullable<Parameters<typeof defineConfig>[0]['webServer']>
const webServers: Extract<WebServer, unknown[]> = []

if (target === 'mock') {
  webServers.push({
    command: 'node packages/mock-services/src/server.ts',
    url: new URL('/health', mockUrl).toString(),
    env: { MOCK_SERVICES_PORT: new URL(mockUrl).port || '80' },
    // Never stop a mock someone else started.
    reuseExistingServer: true,
    timeout: 15_000,
  })
}

webServers.push({
  command: 'node .output/server/index.mjs',
  url: `${baseURL}/api/health`,
  env: {
    PORT: String(port),
    HOST: '127.0.0.1',
    // E2E runs against the test database, never the dev database.
    NUXT_DATABASE_URL: process.env.NUXT_DATABASE_URL_TEST ?? '',
    NUXT_INTEGRATION_TARGET: target,
    NUXT_MOCK_SERVICES_URL: mockUrl,
  },
  reuseExistingServer: reuse,
  timeout: 30_000,
})

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: webServers,
})
