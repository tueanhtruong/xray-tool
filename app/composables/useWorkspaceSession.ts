export interface WorkspaceSummary {
  id: string
  name: string
  siteUrl: string
  jiraConnected: boolean
  xrayConnected: boolean
  projects: Array<{
    id: string
    jiraProjectId: string
    jiraProjectKey: string
    jiraProjectName: string
    projectReadyAt: string
    foldersPulledAt: string | null
  }>
  projectReady?: boolean
  jiraProjectId?: string | null
  jiraProjectKey?: string | null
  jiraProjectName?: string | null
  currentProjectId?: string | null
  foldersPulledAt?: string | null
  legacyProject?: string | null
}

/**
 * Session awareness for pages and the header.
 *
 * The app session stores only `{ userId, activeWorkspaceId }`, so nuxt-auth-utils' `loggedIn`
 * (derived from `session.user`) is always false here. Signed-in state is `session.userId`, and the
 * workspace API is only called when that exists, so signed-out visits log no 401.
 */
export function useWorkspaceSession() {
  const { session, clear } = useUserSession()
  const signedIn = computed(() => typeof session.value?.userId === 'string')

  const fetched = useFetch<{ workspace: WorkspaceSummary }>('/api/auth/session', {
    key: 'workspace-session',
    immediate: signedIn.value,
    watch: false,
    lazy: false,
  })

  const workspace = computed(() => {
    if (!signedIn.value || !fetched.data.value?.workspace) return null
    const currentProjectId = useRoute().query.project
    const projects = fetched.data.value.workspace.projects
    const resolvedProjectId = typeof currentProjectId === 'string'
      ? currentProjectId
      : fetched.data.value.workspace.legacyProject
    const project = resolvedProjectId ? projects.find((candidate) => candidate.id === resolvedProjectId) : undefined
    return {
      ...fetched.data.value.workspace,
      projectReady: Boolean(project),
      jiraProjectId: project?.jiraProjectId ?? null,
      jiraProjectKey: project?.jiraProjectKey ?? null,
      jiraProjectName: project?.jiraProjectName ?? null,
      currentProjectId: project?.id ?? null,
      foldersPulledAt: project?.foldersPulledAt ?? null,
    }
  })

  async function signOut() {
    await $fetch('/auth/logout', {
      method: 'POST',
      headers: { origin: window.location.origin },
    })
    await clear()
    clearNuxtData('workspace-session')
    await navigateTo('/login')
  }

  return {
    signedIn,
    workspace,
    data: fetched.data,
    error: fetched.error,
    refresh: fetched.refresh,
    signOut,
  }
}
