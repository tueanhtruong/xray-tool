/** Builds an Open-in-Jira link from the workspace's stored site URL and a cached issue key. */
export function jiraIssueUrl(siteUrl: string, key: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(key)}`
}
