import { withTimeout } from '#shared/utils/with-timeout'
import { logger } from '../utils/logger'

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
  } catch (err) {
    // The body never carries error details (hosts, credentials); the redacted log does.
    logger.warn('database probe failed', { err })
    return 'down'
  }
}

export default defineEventHandler(async (): Promise<HealthResponse> => {
  const { appVersion } = useRuntimeConfig().public
  return { status: 'ok', db: await probeDatabase(), version: appVersion }
})
