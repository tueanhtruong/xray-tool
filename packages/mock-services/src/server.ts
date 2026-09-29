import { createServer } from 'node:http'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'

/**
 * Mock services for Atlassian auth, Jira REST and Xray. Run with `pnpm mock`.
 * Route prefixes reserved for later stories: /atlassian-auth, /atlassian-api, /xray.
 * Anything not implemented returns 404.
 */
export function createMockApp() {
  const router = createRouter().get(
    '/health',
    defineEventHandler(() => ({ status: 'ok', service: 'mock-services' })),
  )
  const app = createApp()
  app.use(router)
  return app
}

const port = Number(process.env.MOCK_SERVICES_PORT ?? 4010)
const server = createServer(toNodeListener(createMockApp()))

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. Stop the other process or set MOCK_SERVICES_PORT (and NUXT_MOCK_SERVICES_URL) to a free port.`,
    )
  } else {
    console.error(error)
  }
  process.exit(1)
})

server.listen(port, () => {
  console.log(`mock-services listening on http://localhost:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
