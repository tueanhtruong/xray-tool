export interface WorkspaceSummary {
  id: string
  name: string
  siteUrl: string
  jiraConnected: boolean
  xrayConnected: boolean
  projectReady: boolean
  jiraProjectKey: string | null
  jiraProjectName: string | null
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

  const workspace = computed(() => (signedIn.value ? (fetched.data.value?.workspace ?? null) : null))

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
