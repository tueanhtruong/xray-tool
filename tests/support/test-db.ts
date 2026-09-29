import { spawnSync } from 'node:child_process'
import pg from 'pg'

export class UnsafeTestDatabaseError extends Error {
  constructor(reason: string) {
    super(
      `Refusing to reset the test database: ${reason}\n` +
        'Set NUXT_DATABASE_URL_TEST in .env to a separate database whose name ends in "_test" ' +
        '(see .env.example), e.g. postgresql://xray:xray@localhost:5432/xray_test',
    )
    this.name = 'UnsafeTestDatabaseError'
  }
}

interface DatabaseIdentity {
  host: string
  port: string
  name: string
}

function identify(url: string): DatabaseIdentity | undefined {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname.toLowerCase(),
      port: parsed.port || '5432',
      name: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    }
  } catch {
    return undefined
  }
}

/**
 * Returns the test database URL if it is safe to reset, otherwise throws.
 * Safe = parseable, database name ends in `_test`, and not the development database.
 */
export function assertSafeTestDatabaseUrl(
  testUrl: string | undefined,
  devUrl: string | undefined,
): string {
  if (!testUrl) throw new UnsafeTestDatabaseError('NUXT_DATABASE_URL_TEST is not set.')

  const test = identify(testUrl)
  if (!test || !test.name) {
    throw new UnsafeTestDatabaseError('NUXT_DATABASE_URL_TEST is not a valid database URL.')
  }
  if (!test.name.endsWith('_test')) {
    throw new UnsafeTestDatabaseError(`the database name "${test.name}" does not end in "_test".`)
  }

  const dev = devUrl ? identify(devUrl) : undefined
  if (
    testUrl === devUrl ||
    (dev && dev.name === test.name && dev.host === test.host && dev.port === test.port)
  ) {
    throw new UnsafeTestDatabaseError(
      'NUXT_DATABASE_URL_TEST points at the development database (NUXT_DATABASE_URL).',
    )
  }
  return testUrl
}

/**
 * Reset the test database: drop and recreate the `public` schema, then apply all
 * migrations with `prisma migrate deploy`.
 *
 * We do not use `prisma migrate reset --force`: Prisma refuses it when an AI agent
 * runs it, which would block agent-run `pnpm test:int` / `pnpm verify`. Safety comes
 * from `assertSafeTestDatabaseUrl`, which this function re-checks.
 */
export async function resetTestDatabase(
  testUrl: string,
  devUrl: string | undefined,
): Promise<void> {
  assertSafeTestDatabaseUrl(testUrl, devUrl)

  const client = new pg.Client({ connectionString: testUrl, connectionTimeoutMillis: 5_000 })
  try {
    await client.connect()
    await client.query('DROP SCHEMA IF EXISTS public CASCADE')
    await client.query('CREATE SCHEMA public')
  } catch (error) {
    throw new Error(
      `Resetting the test database failed: ${(error as Error).message}\n` +
        'Is Postgres running and does the test database exist? Run ./scripts/init.sh',
      { cause: error },
    )
  } finally {
    await client.end().catch(() => {})
  }

  const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, NUXT_DATABASE_URL: testUrl },
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(
      'Applying migrations to the test database failed:\n' +
        `${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
}
