import { postLoginPath } from '#shared/ui/safe-next-path'
import type { H3Event } from 'h3'
import { clearLoginNext, readLoginNext } from './oauth-cookies'

/**
 * Where to send a user after a successful OAuth sign-in: the validated return path carried in the
 * signed cookie, otherwise the repository. The cookie is single-use. Workspaces without a ready
 * project are forwarded to /settings by the project-ready middleware.
 */
export function resolvePostLoginPath(event: H3Event): string {
  const next = readLoginNext(event)
  clearLoginNext(event)
  return postLoginPath(next)
}
