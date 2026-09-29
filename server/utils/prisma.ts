import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

let client: PrismaClient | undefined

/**
 * Lazily created, process-wide Prisma client backed by the `pg` driver adapter.
 * Created on first use so that importing this module never opens a connection.
 */
export function usePrisma(): PrismaClient {
  if (!client) {
    const { databaseUrl } = useRuntimeConfig()
    const adapter = new PrismaPg({
      connectionString: databaseUrl,
      // Fail fast when the database is unreachable instead of waiting on the OS timeout.
      connectionTimeoutMillis: 2_000,
    })
    client = new PrismaClient({ adapter })
  }
  return client
}
