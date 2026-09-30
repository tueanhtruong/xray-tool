<script setup lang="ts">
const appName = 'Xray Tool'
const { data, refresh: refreshSession } = await useFetch<{ workspace: {
  name: string
  siteUrl: string
  jiraConnected: boolean
  xrayConnected: boolean
  projectReady: boolean
  jiraProjectKey: string | null
  jiraProjectName: string | null
} }>(
  '/api/auth/session',
)
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
const { data: pullStatus, refresh: refreshPullStatus } = await useFetch<{
  state: 'idle' | 'running' | 'succeeded' | 'failed'
  fetched: number
  total: number | null
  folders: number | null
  message?: string
  requestId?: string
}>('/api/pull/status', { lazy: true })
let pullPoll: ReturnType<typeof setInterval> | undefined

async function pullFolders() {
  pullError.value = ''
  pullResult.value = ''
  pullPending.value = true
  try {
    await $fetch('/api/pull/folders', { method: 'POST' })
    await refreshPullStatus()
    pullPoll = setInterval(async () => {
      await refreshPullStatus()
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
  if (
    data.value?.workspace.projectReady &&
    data.value.workspace.jiraProjectKey !== project.key &&
    !window.confirm(`Change the selected project to ${project.key}? The previous project's local cache will be cleared.`)
  ) return
  projectPending.value = true
  try {
    await $fetch('/api/project', {
      method: 'PUT',
      body: {
        projectId: project.id,
        confirmChange: data.value?.workspace.projectReady === true,
      },
    })
    projectMessage.value = `${project.key} is ready.`
    await refreshSession()
  } catch (error) {
    projectError.value = error && typeof error === 'object' && 'data' in error && error.data &&
      typeof error.data === 'object' && 'message' in error.data && typeof error.data.message === 'string'
      ? error.data.message
      : 'Project selection could not be completed. Please try again.'
  } finally {
    projectPending.value = false
  }
}

async function logout() {
  await $fetch('/auth/logout', {
    method: 'POST',
    headers: import.meta.server ? undefined : { origin: window.location.origin },
  })
  await clear()
  await navigateTo('/login')
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
    await refreshSession()
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

useHead({ title: appName })
onBeforeUnmount(() => {
  if (pullPoll) clearInterval(pullPoll)
})
</script>

<template>
  <UContainer class="py-16">
    <h1 class="text-3xl font-semibold" data-testid="app-name">{{ appName }}</h1>
    <p class="mt-2 text-muted">
      Connected to {{ data?.workspace.name }} ({{ data?.workspace.siteUrl }}).
    </p>
    <section class="mt-8 max-w-lg space-y-3" data-testid="onboarding-checklist">
      <h2 class="text-xl font-semibold">Workspace setup</h2>
      <ol class="list-inside list-decimal space-y-1">
        <li>{{ data?.workspace.jiraConnected ? '✓ Jira connected' : 'Jira connection required' }}</li>
        <li>{{ data?.workspace.xrayConnected ? '✓ Xray connected' : 'Xray connection required' }}</li>
        <li>
          <template v-if="data?.workspace.projectReady">
            ✓ Project selected: {{ data.workspace.jiraProjectKey }} — {{ data.workspace.jiraProjectName }}
          </template>
          <template v-else>Project selection required</template>
        </li>
      </ol>
      <p v-if="data?.workspace.projectReady" data-testid="workspace-ready">Ready</p>
      <NuxtLink v-if="data?.workspace.projectReady" to="/repository" class="underline" data-testid="repository-link">Open Test Repository</NuxtLink>
      <section v-if="data?.workspace.projectReady" class="space-y-2" data-testid="pull-folders">
        <UButton :loading="pullPending" @click="pullFolders">Pull folders</UButton>
        <p v-if="pullPending" role="status">Pulling folders… {{ pullStatus?.fetched ?? 0 }} / {{ pullStatus?.total ?? '?' }}</p>
        <UAlert v-if="pullError" color="error" :title="pullError" :description="pullStatus?.requestId ? `Request ID: ${pullStatus.requestId}` : undefined" data-testid="pull-error" />
        <UAlert v-if="pullResult" color="success" :title="pullResult" data-testid="pull-result" />
      </section>
      <form v-if="data?.workspace.jiraConnected && data?.workspace.xrayConnected" class="space-y-3" @submit.prevent="searchProjects(0)">
        <UFormField label="Search Jira projects" name="projectQuery">
          <UInput v-model="projectQuery" data-testid="project-query" />
        </UFormField>
        <UButton type="submit" :loading="projectPending" data-testid="project-search">Search projects</UButton>
      </form>
      <UAlert v-if="projectError" color="error" :title="projectError" data-testid="project-error" />
      <UAlert v-if="projectMessage" color="success" :title="projectMessage" data-testid="project-success" />
      <ul v-if="projectPage" class="space-y-2" data-testid="project-results">
        <li v-for="project in projectPage.values" :key="project.id" class="flex items-center justify-between gap-3">
          <span>{{ project.key }} — {{ project.name }}</span>
          <UButton :loading="projectPending" @click="selectProject(project)">
            {{ data?.workspace.projectReady ? 'Select project' : 'Select' }}
          </UButton>
        </li>
      </ul>
      <div v-if="projectPage && projectPage.total > projectPage.maxResults" class="flex gap-2">
        <UButton :disabled="projectStartAt === 0" variant="outline" @click="searchProjects(Math.max(0, projectStartAt - projectPage.maxResults))">Previous</UButton>
        <UButton :disabled="projectPage.isLast" variant="outline" @click="searchProjects(projectStartAt + projectPage.maxResults)">Next</UButton>
      </div>
    </section>
    <section class="mt-8 max-w-lg space-y-3" data-testid="connection-settings">
      <h2 class="text-xl font-semibold">Jira connection</h2>
      <p>Method: {{ connection?.authMethod === 'API_TOKEN' ? 'API token' : 'Atlassian OAuth' }}</p>
      <p v-if="connection?.email">Email: {{ connection.email }}</p>
      <p v-if="connection?.tokenSavedAt">
        Token saved on {{ new Date(connection.tokenSavedAt).toLocaleDateString() }}
      </p>
      <form v-if="connection?.authMethod === 'API_TOKEN'" class="space-y-3" @submit.prevent="replaceToken">
        <UFormField label="Replace API token" name="replacementToken">
          <UInput v-model="replacementToken" type="password" required autocomplete="new-password" />
        </UFormField>
        <UAlert v-if="connectionError" color="error" :title="connectionError" />
        <UAlert v-if="connectionMessage" color="success" :title="connectionMessage" />
        <UButton type="submit" :loading="connectionPending">Replace token</UButton>
      </form>
      <UButton color="error" variant="outline" data-testid="disconnect" @click="disconnect">
        Disconnect Jira
      </UButton>
    </section>
    <section class="mt-8 max-w-lg space-y-3" data-testid="xray-connection-settings">
      <h2 class="text-xl font-semibold">Xray Cloud connection</h2>
      <p v-if="xrayConnection?.configured" data-testid="xray-connection-status">
        Connected to Xray Cloud · {{ xrayConnection.region }} · configured on
        {{ new Date(xrayConnection.configuredAt ?? '').toLocaleDateString() }} · last verified
        {{ new Date(xrayConnection.verifiedAt ?? '').toLocaleDateString() }}
      </p>
      <form class="space-y-3" @submit.prevent="saveXrayConnection">
        <UFormField label="Xray region" name="xrayRegion">
          <USelect
            v-model="xrayRegion"
            :items="[
              { label: 'Global', value: 'GLOBAL' },
              { label: 'US', value: 'US' },
              { label: 'EU', value: 'EU' },
              { label: 'AU', value: 'AU' },
            ]"
          />
        </UFormField>
        <UFormField label="Xray client ID" name="xrayClientId">
          <UInput v-model="xrayClientId" required autocomplete="off" />
        </UFormField>
        <UFormField label="Xray client secret" name="xrayClientSecret">
          <UInput
            v-model="xrayClientSecret"
            type="password"
            required
            autocomplete="new-password"
          />
        </UFormField>
        <UAlert v-if="xrayError" color="error" :title="xrayError" data-testid="xray-error" />
        <UAlert v-if="xrayMessage" color="success" :title="xrayMessage" />
        <UButton type="submit" :loading="xrayPending" data-testid="xray-test-save">
          Test &amp; save
        </UButton>
      </form>
    </section>
    <UButton class="mt-6" variant="outline" data-testid="logout" @click="logout">Sign out</UButton>
  </UContainer>
</template>
