/**
 * The current request's ID, or undefined outside a request (startup, background work).
 * Relies on Nitro's async context (`nitro.experimental.asyncContext`), so services and
 * integrations can log with the right ID without receiving `event`.
 */
export function getRequestId(): string | undefined {
  try {
    const id = useEvent().context.requestId
    return typeof id === 'string' ? id : undefined
  } catch {
    return undefined
  }
}
