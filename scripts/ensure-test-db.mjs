#!/usr/bin/env node
// Ensures the test database named in NUXT_DATABASE_URL_TEST exists on the same
// server as NUXT_DATABASE_URL. Creates it if missing; never drops anything.
// Used by scripts/init.sh (works locally and against the CI service container).
import { config } from 'dotenv'
import pg from 'pg'

config({ quiet: true })

const devUrl = process.env.NUXT_DATABASE_URL
const testUrl = process.env.NUXT_DATABASE_URL_TEST

if (!devUrl || !testUrl) {
  console.error('NUXT_DATABASE_URL and NUXT_DATABASE_URL_TEST must both be set (see .env.example).')
  process.exit(1)
}

const name = decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, ''))
if (!/^[A-Za-z0-9_]+_test$/.test(name)) {
  console.error(`Test database name "${name}" must match [A-Za-z0-9_]+ and end in "_test".`)
  process.exit(1)
}

const client = new pg.Client({ connectionString: devUrl, connectionTimeoutMillis: 5_000 })
try {
  await client.connect()
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
  if (rowCount === 0) {
    await client.query(`CREATE DATABASE "${name}"`)
    console.log(`Created database ${name}`)
  } else {
    console.log(`Database ${name} already exists`)
  }
} catch (error) {
  console.error(`Could not ensure test database ${name}: ${error.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
