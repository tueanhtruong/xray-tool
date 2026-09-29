export const TOKEN_REFRESH_WINDOW_MS = 60_000

export function isTokenExpiring(expiresAt: Date | number, now = Date.now()): boolean {
  const expiry = expiresAt instanceof Date ? expiresAt.getTime() : expiresAt
  return expiry - now <= TOKEN_REFRESH_WINDOW_MS
}
