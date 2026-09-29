export interface JiraCredentialShape {
  authMethod: 'OAUTH' | 'API_TOKEN'
  accessToken: string | null
  refreshToken: string | null
  expiresAt: Date | null
  apiToken: string | null
  apiEmail: string | null
}

export function hasValidJiraCredentialShape(
  workspace: { cloudId: string | null },
  connection: JiraCredentialShape,
): boolean {
  if (connection.authMethod === 'OAUTH') {
    return Boolean(
      workspace.cloudId &&
        connection.accessToken &&
        connection.refreshToken &&
        connection.expiresAt &&
        !connection.apiToken &&
        !connection.apiEmail,
    )
  }
  return Boolean(
    !workspace.cloudId &&
      connection.apiToken &&
      connection.apiEmail &&
      !connection.accessToken &&
      !connection.refreshToken &&
      !connection.expiresAt,
  )
}
