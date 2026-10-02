export interface PullStatus {
  state: string
  fetched: number
  total: number | null
  folders: number | null
  message?: string
  requestId?: string
}

/** Starts a full pull, polls its status, and reports completion through `onSucceeded`. */
export function useRepositoryPull(projectId: Ref<string | null>, onSucceeded: () => Promise<void> | void) {
  const pulling = ref(false)
  const error = ref('')
  const message = ref('')
  const status = ref<PullStatus>({ state: 'idle', fetched: 0, total: null, folders: null })
  let poll: ReturnType<typeof setInterval> | undefined

  async function refreshStatus() {
    if (!projectId.value) return
    status.value = await $fetch<PullStatus>('/api/pull/status', { query: { project: projectId.value } })
  }

  function stopPolling() {
    if (poll) clearInterval(poll)
    poll = undefined
  }

  function startPolling() {
    stopPolling()
    poll = setInterval(async () => {
      await refreshStatus()
      if (status.value.state === 'running') return
      stopPolling()
      pulling.value = false
      if (status.value.state === 'succeeded') {
        message.value = `${projectId.value}: ${status.value.message ?? 'Pull completed.'}`
        await onSucceeded()
      } else if (status.value.state === 'failed') {
        error.value = `${projectId.value}: ${status.value.message ?? 'Pull failed.'}`
      }
    }, 500)
  }

  async function start() {
    error.value = ''
    message.value = ''
    pulling.value = true
    try {
      if (!projectId.value) throw new Error('Choose a project before refreshing tests.')
      if (!window.confirm(`Refresh all tests for this project? The complete project index will be refreshed and may take time.`)) {
        pulling.value = false
        return
      }
      await $fetch('/api/pull', { method: 'POST', query: { project: projectId.value } })
      await refreshStatus()
      startPolling()
    } catch (caught) {
      pulling.value = false
      error.value =
        caught && typeof caught === 'object' && 'data' in caught && caught.data &&
        typeof caught.data === 'object' && 'message' in caught.data &&
        typeof caught.data.message === 'string'
          ? caught.data.message
          : 'Pull could not be started. Try again.'
    }
  }

  /** Call once on mount: loads the status and resumes polling if a pull is already running. */
  async function resume() {
    await refreshStatus()
    if (status.value.state === 'running') {
      pulling.value = true
      startPolling()
    }
  }

  onBeforeUnmount(stopPolling)

  watch(projectId, () => {
    error.value = ''
    message.value = ''
    status.value = { state: 'idle', fetched: 0, total: null, folders: null }
  })

  return { pulling, error, message, status, start, resume }
}
