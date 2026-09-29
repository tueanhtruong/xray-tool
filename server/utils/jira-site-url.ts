import { parseJiraSiteUrl } from '#shared/jira/site-url'

export function validateJiraSiteUrl(value: unknown) {
  const config = useRuntimeConfig()
  const suffixes = Array.isArray(config.jiraSiteUrlSuffixes)
    ? config.jiraSiteUrlSuffixes
    : typeof config.jiraSiteUrlSuffixes === 'string'
      ? config.jiraSiteUrlSuffixes.split(',').map((item) => item.trim()).filter(Boolean)
      : []
  return parseJiraSiteUrl(value, suffixes)
}
