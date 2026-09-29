export const DEFAULT_JIRA_SITE_SUFFIXES = ['atlassian.net'] as const

export type JiraSiteUrlResult =
  | { success: true; origin: string; hostname: string }
  | { success: false; message: string }

function isIpAddress(hostname: string): boolean {
  return hostname.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(hostname)
}

export function parseJiraSiteUrl(
  value: unknown,
  allowedSuffixes: readonly string[] = DEFAULT_JIRA_SITE_SUFFIXES,
): JiraSiteUrlResult {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    return { success: false, message: 'Enter a valid Jira site URL.' }
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { success: false, message: 'Enter a valid Jira site URL.' }
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const explicitlyHasPort = /^https:\/\/[^/?#]+:\d+(?:[/?#]|$)/i.test(value)
  const suffixes = [...DEFAULT_JIRA_SITE_SUFFIXES, ...allowedSuffixes]
    .map((suffix) => suffix.toLowerCase().replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
  const allowedHost = suffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  )

  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    isIpAddress(hostname) ||
    !allowedHost ||
    url.username !== '' ||
    url.password !== '' ||
    explicitlyHasPort ||
    !['', '/', '/rest/api/3', '/rest/api/3/'].includes(url.pathname) ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return {
      success: false,
      message: 'Enter an allowed HTTPS Jira site URL or its /rest/api/3 base URL, without a port.',
    }
  }

  return { success: true, origin: `https://${hostname}`, hostname }
}
