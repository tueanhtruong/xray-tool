import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const MOCK_ENTRY = fileURLToPath(
  new URL('../../packages/mock-services/src/server.ts', import.meta.url),
)

export interface MockServicesHandle {
  /** false when an already-running mock was reused. */
  started: boolean
  /** Stops the mock only if this handle started it. */
  stop: () => Promise<void>
}

export async function isMockHealthy(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(new URL('/health', baseUrl), { signal: AbortSignal.timeout(1_000) })
    if (!res.ok) return false
    const body = (await res.json()) as { status?: string }
    return body.status === 'ok'
  } catch {
    return false
  }
}

async function resetOAuthMode(baseUrl: string): Promise<void> {
  await fetch(new URL('/__control', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'single',
      projectMode: 'valid',
      xrayMode: 'valid',
      xrayFolderMode: 'flat',
      xrayTestMode: 'five',
      xrayTestFailureStart: -1,
    }),
  })
}

/** Reuse a running mock at `baseUrl`, or start one and wait until `/health` responds. */
export async function startMockServices(
  baseUrl: string,
  timeoutMs = 10_000,
): Promise<MockServicesHandle> {
  if (await isMockHealthy(baseUrl)) {
    // A reused mock keeps state from earlier files; OAuth scenarios must start from the default.
    await resetOAuthMode(baseUrl)
    return { started: false, stop: async () => {} }
  }

  const port = new URL(baseUrl).port || '80'
  const child = spawn(process.execPath, [MOCK_ENTRY], {
    env: { ...process.env, MOCK_SERVICES_PORT: port },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  let exited = false
  child.once('exit', () => (exited = true))

  const deadline = Date.now() + timeoutMs
  while (!(await isMockHealthy(baseUrl))) {
    if (exited) throw new Error(`mock-services exited before becoming healthy on ${baseUrl}`)
    if (Date.now() > deadline) {
      child.kill('SIGTERM')
      throw new Error(`mock-services did not become healthy on ${baseUrl} within ${timeoutMs} ms`)
    }
    await new Promise((r) => setTimeout(r, 100))
  }

  return {
    started: true,
    stop: async () => {
      if (exited) return
      child.kill('SIGTERM')
      await once(child, 'exit')
    },
  }
}
