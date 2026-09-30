export interface ApiTokenFormValues {
  siteUrl: string
  email: string
  apiToken: string
}

export interface ApiTokenFormErrors {
  siteUrl?: string
  email?: string
}

export const SITE_URL_MESSAGE = 'Use https://<your-site>.atlassian.net'

const SITE_PATTERN = /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+atlassian\.net\/?$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Client-side convenience check only; the server remains the authority. */
export function validateApiTokenForm(values: ApiTokenFormValues): {
  valid: boolean
  errors: ApiTokenFormErrors
} {
  const errors: ApiTokenFormErrors = {}
  const siteUrl = values.siteUrl.trim()
  const email = values.email.trim()
  if (siteUrl.length > 0 && !SITE_PATTERN.test(siteUrl)) errors.siteUrl = SITE_URL_MESSAGE
  if (email.length > 0 && !EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address'
  const valid =
    siteUrl.length > 0 &&
    email.length > 0 &&
    values.apiToken.length > 0 &&
    !errors.siteUrl &&
    !errors.email
  return { valid, errors }
}
