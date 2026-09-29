import { getRequestURL, sendRedirect } from 'h3'
import { getAppSession } from '../utils/session'

const PUBLIC_PATHS = new Set([
  '/login',
  '/auth/jira/select-site',
  '/auth/jira/login',
  '/auth/jira/callback',
  '/api/auth/jira/sites',
  '/api/auth/jira/select-site',
  '/api/health',
  '/auth/logout',
])

export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event)
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
  if (!pathname.startsWith('/api/') && pathname !== '/') return
  if (await getAppSession(event)) return
  if (pathname.startsWith('/api/')) {
    throw httpError(401, 'Sign in to continue.')
  }
  return sendRedirect(event, '/login', 302)
})
