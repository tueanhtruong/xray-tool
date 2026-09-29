import { describe, expect, it } from 'vitest'
import { parseJiraSiteUrl } from '~~/shared/jira/site-url'

describe('parseJiraSiteUrl', () => {
  it('normalizes a valid Atlassian Jira site origin', () => {
    expect(parseJiraSiteUrl('https://Acme.atlassian.net/')).toEqual({
      success: true,
      origin: 'https://acme.atlassian.net',
      hostname: 'acme.atlassian.net',
    })
  })

  it.each(['https://oneline.atlassian.net/rest/api/3', 'https://oneline.atlassian.net/rest/api/3/'])(
    'accepts and normalizes the Jira REST API base URL %s',
    (input) => {
      expect(parseJiraSiteUrl(input)).toEqual({
        success: true,
        origin: 'https://oneline.atlassian.net',
        hostname: 'oneline.atlassian.net',
      })
    },
  )

  it.each([
    'http://acme.atlassian.net',
    'https://169.254.169.254',
    'https://acme.atlassian.net.evil.io',
    'https://user:pw@acme.atlassian.net',
    'https://acme.atlassian.net:443',
    'https://acme.atlassian.net/path',
    'https://acme.atlassian.net/rest/api/2',
    'https://acme.atlassian.net/rest/api/3/myself',
    'https://acme.atlassian.net/?next=x',
    'https://acme.atlassian.net/#fragment',
  ])('rejects unsafe URL %s', (url) => {
    expect(parseJiraSiteUrl(url).success).toBe(false)
  })

  it('accepts explicitly configured suffixes only on a hostname boundary', () => {
    expect(parseJiraSiteUrl('https://jira.corp.example.org', ['corp.example.org']).success).toBe(
      true,
    )
    expect(parseJiraSiteUrl('https://notcorp.example.org', ['corp.example.org']).success).toBe(
      false,
    )
  })
})
