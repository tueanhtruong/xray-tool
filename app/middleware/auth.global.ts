import { safeNextPath } from '#shared/ui/safe-next-path'

const PROTECTED_PAGES = ['/settings', '/repository', '/tests']

/**
 * Client-side navigation mirror of the server guard (server/middleware/01.auth.ts), which only sees
 * full page loads. Signed-in state is `session.userId` (see useWorkspaceSession).
 */
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  const { session } = useUserSession()
  const signedIn = typeof session.value?.userId === 'string'
  const isProtected = PROTECTED_PAGES.some((page) => to.path === page || to.path.startsWith(`${page}/`))
  if (isProtected && !signedIn) {
    return navigateTo({ path: '/login', query: { next: safeNextPath(to.fullPath) } })
  }
  if (to.path === '/login' && signedIn) {
    return navigateTo(safeNextPath(to.query.next) ?? '/repository')
  }
})
