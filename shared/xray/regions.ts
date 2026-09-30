export const XRAY_REGIONS = ['GLOBAL', 'US', 'EU', 'AU'] as const
export type XrayRegion = (typeof XRAY_REGIONS)[number]

export const XRAY_REGION_URLS: Record<XrayRegion, string> = {
  GLOBAL: 'https://xray.cloud.getxray.app',
  US: 'https://us.xray.cloud.getxray.app',
  EU: 'https://eu.xray.cloud.getxray.app',
  AU: 'https://au.xray.cloud.getxray.app',
}

export function isXrayRegion(value: unknown): value is XrayRegion {
  return typeof value === 'string' && (XRAY_REGIONS as readonly string[]).includes(value)
}

/** Decode only the untrusted exp claim needed to determine whether a JWT can be reused. */
export function xrayJwtExpiresAt(jwt: string): Date | undefined {
  const parts = jwt.split('.')
  if (parts.length !== 3 || !parts[1]) return undefined
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(parts[1])) return undefined
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
      exp?: unknown
    }
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= 0) {
      return undefined
    }
    const milliseconds = payload.exp * 1000
    if (!Number.isFinite(milliseconds)) return undefined
    const expiry = new Date(milliseconds)
    return Number.isNaN(expiry.getTime()) ? undefined : expiry
  } catch {
    return undefined
  }
}

export function isXrayJwtReusable(
  expiresAt: Date | undefined,
  now = Date.now(),
  refreshWindowMs = 60_000,
): boolean {
  return Boolean(expiresAt && expiresAt.getTime() - now > refreshWindowMs)
}
