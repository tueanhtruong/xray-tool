import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

export const SERVER_ENTRY = fileURLToPath(
  new URL('../../.output/server/index.mjs', import.meta.url),
)

export function assertBuilt(): void {
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error(
      '.output/server/index.mjs not found. Build the app first with `pnpm build` ' +
        '(or `pnpm check`, which builds as its last step).',
    )
  }
}

/** Environment for the server child: the current env without any NUXT_* variables, plus `env`. */
export function serverEnv(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('NUXT_')),
  )
  return { ...base, ...env }
}

export async function getFreePort(): Promise<number> {
  const srv = createServer()
  srv.listen(0, '127.0.0.1')
  await once(srv, 'listening')
  const address = srv.address()
  srv.close()
  if (!address || typeof address === 'string') throw new Error('Could not allocate a port')
  return address.port
}

export interface RunningServer {
  url: string
  stop: () => Promise<void>
}

/** Start the built server and wait until it answers `/api/health`. */
export async function startBuiltServer(
  env: Record<string, string | undefined>,
  timeoutMs = 15_000,
): Promise<RunningServer> {
  assertBuilt()
  const port = await getFreePort()
  const url = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: serverEnv({ ...env, PORT: String(port), HOST: '127.0.0.1' }),
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))
  let exited = false
  child.once('exit', () => (exited = true))

  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (exited) throw new Error(`Built server exited during startup:\n${stderr}`)
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3_000) })
      if (res.ok) break
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      child.kill('SIGTERM')
      throw new Error(`Built server did not start within ${timeoutMs} ms:\n${stderr}`)
    }
    await new Promise((r) => setTimeout(r, 150))
  }

  return {
    url,
    stop: async () => {
      if (exited) return
      child.kill('SIGTERM')
      await once(child, 'exit')
    },
  }
}

/** Start the built server and wait for it to exit on its own (e.g. config fail-fast). */
export async function runBuiltServerUntilExit(
  env: Record<string, string | undefined>,
  timeoutMs = 15_000,
): Promise<{ code: number | null; stderr: string }> {
  assertBuilt()
  const port = await getFreePort()
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: serverEnv({ ...env, PORT: String(port), HOST: '127.0.0.1' }),
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  const [code] = (await once(child, 'exit')) as [number | null]
  clearTimeout(timer)
  return { code, stderr }
}
