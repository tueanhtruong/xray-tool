import { describe, expect, it } from 'vitest'
import { jiraIssueUrl } from '#shared/jira/issue-url'

describe('jiraIssueUrl', () => {
  it('joins the site and encoded key', () => {
    expect(jiraIssueUrl('https://acme.atlassian.net', 'ONEDS-1')).toBe('https://acme.atlassian.net/browse/ONEDS-1')
    expect(jiraIssueUrl('https://acme.atlassian.net///', 'A B/1')).toBe('https://acme.atlassian.net/browse/A%20B%2F1')
  })
})
