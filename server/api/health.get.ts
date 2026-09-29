import { withTimeout } from '#shared/utils/with-timeout'

const DB_PROBE_TIMEOUT_MS = 2_000

interface HealthResponse {
  status: 'ok'
  db: 'ok' | 'down'
  version: string
}

async function probeDatabase(): Promise<HealthResponse['db']> {
  try {
    await withTimeout(usePrisma().$queryRaw`SELECT 1`, DB_PROBE_TIMEOUT_MS)
    return 'ok'
  } catch {
    // Deliberately no error details: the body must never leak hosts or credentials.
    return 'down'
  }
}

export default defineEventHandler(async (): Promise<HealthResponse> => {
  const { appVersion } = useRuntimeConfig().public
  return { status: 'ok', db: await probeDatabase(), version: appVersion }
})
