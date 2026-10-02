import { postLoginPath, safeNextPath } from '#shared/ui/safe-next-path'
import { getQuery, getRequestURL, sendRedirect } from 'h3'
import { getAppSession } from '../utils/session'

const PUBLIC_PATHS = new Set([
  '/login',
  '/auth/jira/select-site',
  '/auth/jira/login',
  '/auth/jira/callback',
  '/api/auth/jira/sites',
  '/api/auth/jira/select-site',
  '/api/auth/jira/api-token',
  '/api/auth/xray',
  '/api/project',
  '/api/health',
  '/auth/logout',
])

// Pages that require a session. `/`, `/login` and `/auth/*` are public.
const PROTECTED_PAGES = ['/settings', '/repository', '/tests', '/projects']

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))
}

export default defineEventHandler(async (event) => {
  const { pathname, search } = getRequestURL(event)
  if (pathname === '/login' && event.method === 'GET' && (await getAppSession(event))) {
    return sendRedirect(event, postLoginPath(getQuery(event).next), 302)
  }
  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/_nuxt/') ||
    pathname.startsWith('/__nuxt') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt'
  ) {
    return
  }

  if (pathname === '/api/_auth/session') return
  // Let unknown URLs reach Nitro/Nuxt's 404 handler rather than disguising them as auth failures.
  if (
    pathname.startsWith('/api/') &&
    pathname !== '/api/auth/session' &&
    !pathname.startsWith('/api/jira/')
  ) {
    return
  }
  if (!pathname.startsWith('/api/') && !isProtectedPage(pathname)) return
  if (await getAppSession(event)) return
  if (pathname.startsWith('/api/')) {
    throw httpError(401, 'Sign in to continue.')
  }
  const next = safeNextPath(`${pathname}${search}`)
  return sendRedirect(event, next ? `/login?next=${encodeURIComponent(next)}` : '/login', 302)
})
