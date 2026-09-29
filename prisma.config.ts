import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'prisma/config'

// Prisma 7 does not load .env on its own. Existing env variables win, so
// integration tests can point NUXT_DATABASE_URL at the test database.
loadDotenv({ quiet: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Not required for `prisma generate`, so `pnpm check` works without .env.
    url: process.env.NUXT_DATABASE_URL ?? '',
  },
})
