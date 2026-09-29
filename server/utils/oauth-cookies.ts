import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { validateSessionPassword } from '#shared/config/schema'
import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3'

const STATE_COOKIE = 'jira_oauth_state'
const PENDING_COOKIE = 'jira_oauth_pending'
const COOKIE_MAX_AGE = 600

function cookieSecret(): string {
  const { session } = useRuntimeConfig()
  const password = session?.password
  const error = validateSessionPassword(password)
  if (error) throw new Error(error)
  return password as string
}

function signature(value: string): string {
  return createHmac('sha256', cookieSecret()).update(value).digest('base64url')
}

function sign(value: string): string {
  return `${value}.${signature(value)}`
}

function verify(value: string | undefined): string | undefined {
  if (!value) return undefined
  const index = value.lastIndexOf('.')
  if (index <= 0) return undefined
  const raw = value.slice(0, index)
  const supplied = Buffer.from(value.slice(index + 1))
  const expected = Buffer.from(signature(raw))
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
    ? raw
    : undefined
}

function cookieOptions(maxAge = COOKIE_MAX_AGE) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

export function newOAuthState(): string {
  return randomBytes(32).toString('base64url')
}

export function setOAuthState(event: H3Event, state: string): void {
  setCookie(event, STATE_COOKIE, sign(state), cookieOptions())
}

export function readOAuthState(event: H3Event): string | undefined {
  return verify(getCookie(event, STATE_COOKIE))
}

export function clearOAuthState(event: H3Event): void {
  deleteCookie(event, STATE_COOKIE, { path: '/' })
}

export function setPendingFlow(event: H3Event, id: string): void {
  setCookie(event, PENDING_COOKIE, sign(id), cookieOptions())
}

export function readPendingFlow(event: H3Event): string | undefined {
  return verify(getCookie(event, PENDING_COOKIE))
}

export function clearPendingFlow(event: H3Event): void {
  deleteCookie(event, PENDING_COOKIE, { path: '/' })
}

export function ensureSessionConfig(): void {
  cookieSecret()
}
