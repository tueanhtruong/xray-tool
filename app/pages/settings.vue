<script setup lang="ts">
const { data } = useWorkspaceSession()
const { clear } = useUserSession()
const { data: connection, refresh: refreshConnection } = await useFetch<{
  siteUrl: string
  authMethod: 'OAUTH' | 'API_TOKEN'
  email: string | null
  tokenSavedAt: string | null
}>('/api/auth/connection')
const { data: xrayConnection, refresh: refreshXrayConnection } = await useFetch<{
  configured: boolean
  region?: 'GLOBAL' | 'US' | 'EU' | 'AU'
  configuredAt?: string
  verifiedAt?: string
}>('/api/auth/xray', { lazy: true })
const replacementToken = ref('')
const xrayClientId = ref('')
const xrayClientSecret = ref('')
const xrayRegion = ref<'GLOBAL' | 'US' | 'EU' | 'AU'>('GLOBAL')
const connectionError = ref('')
const connectionMessage = ref('')
const xrayError = ref('')
const xrayMessage = ref('')
const connectionPending = ref(false)
const xrayPending = ref(false)
const projectQuery = ref('')
const projectStartAt = ref(0)
const projectPage = ref<{ values: Array<{ id: string; key: string; name: string }>; total: number; startAt: number; maxResults: number; isLast: boolean }>()
const projectError = ref('')
const projectMessage = ref('')
const projectPending = ref(false)
const pullPending = ref(false)
const pullError = ref('')
const pullResult = ref('')
const { data: pullStatus } = await useFetch<{
  state: 'idle' | 'running' | 'succeeded' | 'failed'
  fetched: number
  total: number | null
  folders: number | null
  message?: string
  requestId?: string
}>('/api/pull/status', { lazy: true })
let pullPoll: ReturnType<typeof setInterval> | undefined

async function pullFolders(projectId: string) {
  pullError.value = ''
  pullResult.value = ''
  pullPending.value = true
  try {
    await $fetch('/api/pull/folders', { method: 'POST', query: { project: projectId } })
    pullStatus.value = await $fetch<typeof pullStatus.value>('/api/pull/status', { query: { project: projectId } })
    pullPoll = setInterval(async () => {
      pullStatus.value = await $fetch<typeof pullStatus.value>('/api/pull/status', { query: { project: projectId } })
      if (pullStatus.value?.state !== 'running') {
        if (pullPoll) clearInterval(pullPoll)
        pullPoll = undefined
        pullPending.value = false
        if (pullStatus.value?.state === 'succeeded') pullResult.value = pullStatus.value.message ?? 'Folder pull completed.'
        if (pullStatus.value?.state === 'failed') pullError.value = pullStatus.value.message ?? 'Xray folders could not be pulled.'
      }
    }, 500)
  } catch (error) {
    pullPending.value = false
    pullError.value = error && typeof error === 'object' && 'data' in error && error.data &&
      typeof error.data === 'object' && 'message' in error.data && typeof error.data.message === 'string'
      ? error.data.message
      : 'Xray folders could not be pulled. Check the Xray connection and try again.'
  }
}

async function searchProjects(startAt = 0) {
  projectError.value = ''
  projectStartAt.value = startAt
  try {
    const params = new URLSearchParams({ query: projectQuery.value, startAt: String(startAt), maxResults: '20' })
    const response = await fetch(`/api/jira/projects?${params.toString()}`)
    const body = await response.json() as typeof projectPage.value
    if (!response.ok) throw { data: body }
    projectPage.value = body ?? undefined
  } catch (error) {
    projectError.value = error && typeof error === 'object' && 'data' in error && error.data &&
      typeof error.data === 'object' && 'message' in error.data && typeof error.data.message === 'string'
      ? error.data.message
      : 'Jira projects could not be loaded. Check the Jira connection and try again.'
  }
}

async function selectProject(project: { id: string; key: string; name: string }) {
  projectError.value = ''
  projectMessage.value = ''
  projectPending.value = true
  try {
    const result = await $fetch<{ projectId: string; jiraProjectId?: string }>('/api/project', {
      method: 'PUT',
      body: { projectId: project.id },
    })
    projectMessage.value = `${project.key} is ready.`
    await refreshNuxtData('workspace-session')
    const projectId = result.projectId
    if (data.value && !data.value.workspace.projects.some((candidate) => candidate.id === projectId)) {
      data.value.workspace.projects = [...data.value.workspace.projects, {
        id: projectId,
        jiraProjectId: result.jiraProjectId ?? project.id,
        jiraProjectKey: project.key,
        jiraProjectName: project.name,
        projectReadyAt: new Date().toISOString(),
        foldersPulledAt: null,
      }]
    }
  } catch (error) {
    projectError.value = error && typeof error === 'object' && 'data' in error && error.data &&
      typeof error.data === 'object' && 'message' in error.data && typeof error.data.message === 'string'
      ? error.data.message
      : 'Project selection could not be completed. Please try again.'
  } finally {
    projectPending.value = false
  }
}

async function replaceToken() {
  connectionError.value = ''
  connectionMessage.value = ''
  connectionPending.value = true
  try {
    await $fetch('/api/auth/jira/api-token', {
      method: 'PUT',
      body: { apiToken: replacementToken.value },
    })
    replacementToken.value = ''
    connectionMessage.value = 'Jira API token updated.'
    await refreshConnection()
  } catch (error) {
    connectionError.value =
      error && typeof error === 'object' && 'data' in error && error.data &&
      typeof error.data === 'object' && 'message' in error.data &&
      typeof error.data.message === 'string'
        ? error.data.message
        : 'Token could not be replaced. Please try again.'
  } finally {
    connectionPending.value = false
  }
}

async function disconnect() {
  await $fetch('/api/auth/connection', { method: 'DELETE' })
  await clear()
  clearNuxtData('workspace-session')
  await navigateTo('/login')
}

async function saveXrayConnection() {
  xrayError.value = ''
  xrayMessage.value = ''
  xrayPending.value = true
  try {
    await $fetch('/api/auth/xray', {
      method: 'PUT',
      body: {
        region: xrayRegion.value,
        clientId: xrayClientId.value,
        clientSecret: xrayClientSecret.value,
      },
    })
    xrayClientId.value = ''
    xrayClientSecret.value = ''
    xrayMessage.value = 'Connected to Xray Cloud'
    await refreshXrayConnection()
    await refreshNuxtData('workspace-session')
  } catch (error) {
    xrayError.value =
      error && typeof error === 'object' && 'data' in error && error.data &&
      typeof error.data === 'object' && 'message' in error.data &&
      typeof error.data.message === 'string'
        ? error.data.message
        : 'Xray connection could not be verified. Please try again.'
  } finally {
    xrayClientSecret.value = ''
    xrayPending.value = false
  }
}

useHead({ title: 'Settings · XrayBulk' })
onBeforeUnmount(() => {
  if (pullPoll) clearInterval(pullPoll)
})
</script>

<template>
  <main class="mx-auto max-w-5xl space-y-5 px-5 py-8">
    <div>
      <h1 class="text-2xl font-semibold text-highlighted">Settings</h1>
      <p class="mt-1 text-muted">
        Connected to {{ data?.workspace.name }} ({{ data?.workspace.siteUrl }}).
      </p>
    </div>

    <PageCard title="Workspace setup" data-testid="onboarding-checklist">
      <ol class="list-inside list-decimal space-y-1">
        <li>{{ data?.workspace.jiraConnected ? '✓ Jira connected' : 'Jira connection required' }}</li>
        <li>{{ data?.workspace.xrayConnected ? '✓ Xray connected' : 'Xray connection required' }}</li>
        <li>
          {{ data?.workspace.projects.length ? `✓ ${data.workspace.projects.length} project(s) authorized` : 'Project selection required' }}
        </li>
      </ol>
      <div v-if="data?.workspace.projects.length" class="mt-3 flex flex-wrap items-center gap-3">
        <StatusBadge tone="ok"><span data-testid="workspace-ready">Ready</span></StatusBadge>
        <NuxtLink v-for="project in data.workspace.projects" :key="project.id" :to="{ path: '/repository', query: { project: project.id } }" class="font-medium text-primary underline" data-testid="repository-link">Open {{ project.jiraProjectKey }}</NuxtLink>
      </div>
    </PageCard>

    <div class="grid gap-5 md:grid-cols-2">
      <PageCard title="Jira connection" data-testid="connection-settings">
        <div class="space-y-3">
          <p>Method: {{ connection?.authMethod === 'API_TOKEN' ? 'API token' : 'Atlassian OAuth' }}</p>
          <p v-if="connection?.email">Email: {{ connection.email }}</p>
          <p v-if="connection?.tokenSavedAt">
            Token saved on {{ new Date(connection.tokenSavedAt).toLocaleDateString() }}
          </p>
          <form v-if="connection?.authMethod === 'API_TOKEN'" class="space-y-3" @submit.prevent="replaceToken">
            <UFormField label="Replace API token" name="replacementToken">
              <UInput v-model="replacementToken" class="w-full" type="password" required autocomplete="new-password" />
            </UFormField>
            <ErrorBanner v-if="connectionError" :message="connectionError" />
            <p v-if="connectionMessage" role="status" class="text-(--ok)">{{ connectionMessage }}</p>
            <UButton type="submit" :disabled="connectionPending">Replace token</UButton>
          </form>
          <UButton color="error" variant="outline" data-testid="disconnect" @click="disconnect">
            Disconnect Jira
          </UButton>
        </div>
      </PageCard>

      <PageCard title="Xray Cloud connection" data-testid="xray-connection-settings">
        <div class="space-y-3">
          <p v-if="xrayConnection?.configured" data-testid="xray-connection-status">
            Connected to Xray Cloud · {{ xrayConnection.region }} · configured on
            {{ new Date(xrayConnection.configuredAt ?? '').toLocaleDateString() }} · last verified
            {{ new Date(xrayConnection.verifiedAt ?? '').toLocaleDateString() }}
          </p>
          <form class="space-y-3" @submit.prevent="saveXrayConnection">
            <UFormField label="Xray region" name="xrayRegion">
              <USelect
                v-model="xrayRegion"
                class="w-full"
                :items="[
                  { label: 'Global', value: 'GLOBAL' },
                  { label: 'US', value: 'US' },
                  { label: 'EU', value: 'EU' },
                  { label: 'AU', value: 'AU' },
                ]"
              />
            </UFormField>
            <UFormField label="Xray client ID" name="xrayClientId">
              <UInput v-model="xrayClientId" class="w-full" required autocomplete="off" />
            </UFormField>
            <UFormField label="Xray client secret" name="xrayClientSecret">
              <UInput v-model="xrayClientSecret" class="w-full" type="password" required autocomplete="new-password" />
            </UFormField>
            <div v-if="xrayError" data-testid="xray-error"><ErrorBanner :message="xrayError" /></div>
            <p v-if="xrayMessage" role="status" class="text-(--ok)">{{ xrayMessage }}</p>
            <UButton type="submit" :disabled="xrayPending" data-testid="xray-test-save">
              Test &amp; save
            </UButton>
          </form>
        </div>
      </PageCard>
    </div>

    <PageCard v-if="data?.workspace.jiraConnected && data?.workspace.xrayConnected" title="Project" description="Choose the Jira project whose Xray tests you want to work with.">
      <form class="space-y-3" @submit.prevent="searchProjects(0)">
        <UFormField label="Search Jira projects" name="projectQuery">
          <UInput v-model="projectQuery" class="w-full max-w-md" data-testid="project-query" />
        </UFormField>
        <UButton type="submit" :disabled="projectPending" data-testid="project-search">Search projects</UButton>
      </form>
      <div v-if="projectError" class="mt-3" data-testid="project-error"><ErrorBanner :message="projectError" /></div>
      <p v-if="projectMessage" role="status" class="mt-3 text-(--ok)" data-testid="project-success">{{ projectMessage }}</p>
      <ul v-if="projectPage" class="mt-3 space-y-2" data-testid="project-results">
        <li v-for="project in projectPage.values" :key="project.id" class="flex items-center justify-between gap-3">
          <span>{{ project.key }} — {{ project.name }}</span>
          <UButton :disabled="projectPending" @click="selectProject(project)">
            {{ data?.workspace.projects.some((current) => current.jiraProjectId === project.id) ? 'Open project' : 'Connect project' }}
          </UButton>
        </li>
      </ul>
      <div v-if="projectPage && projectPage.total > projectPage.maxResults" class="mt-3 flex gap-2">
        <UButton :disabled="projectStartAt === 0" variant="outline" @click="searchProjects(Math.max(0, projectStartAt - projectPage.maxResults))">Previous</UButton>
        <UButton :disabled="projectPage.isLast" variant="outline" @click="searchProjects(projectStartAt + projectPage.maxResults)">Next</UButton>
      </div>
    </PageCard>

    <PageCard v-if="data?.workspace.projects.length" title="Folders" description="Refresh each authorized project's folder tree from Xray." data-testid="pull-folders">
      <div v-for="project in data?.workspace.projects ?? []" :key="project.id" class="space-y-2 border-b border-default py-3 last:border-0">
        <p class="font-medium">{{ project.jiraProjectKey }} — {{ project.jiraProjectName }}</p>
        <UButton :disabled="pullPending" @click="pullFolders(project.id)">Refresh folders</UButton>
        <p v-if="pullPending" role="status">Pulling folders… {{ pullStatus?.fetched ?? 0 }} / {{ pullStatus?.total ?? '?' }}</p>
        <div v-if="pullError" data-testid="pull-error">
          <ErrorBanner :message="pullError" :title="pullStatus?.requestId ? `Request ID: ${pullStatus.requestId}` : undefined" />
        </div>
        <p v-if="pullResult" role="status" class="text-(--ok)" data-testid="pull-result">{{ pullResult }}</p>
      </div>
    </PageCard>
  </main>
</template>
