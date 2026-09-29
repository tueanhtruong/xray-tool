<script setup lang="ts">
const appName = 'Xray Tool'
const { data } = await useFetch<{ workspace: { name: string; siteUrl: string } }>(
  '/api/auth/session',
)
const { clear } = useUserSession()
const { data: connection, refresh: refreshConnection } = await useFetch<{
  siteUrl: string
  authMethod: 'OAUTH' | 'API_TOKEN'
  email: string | null
  tokenSavedAt: string | null
}>('/api/auth/connection')
const replacementToken = ref('')
const connectionError = ref('')
const connectionMessage = ref('')
const connectionPending = ref(false)

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

useHead({ title: appName })
</script>

<template>
  <UContainer class="py-16">
    <h1 class="text-3xl font-semibold" data-testid="app-name">{{ appName }}</h1>
    <p class="mt-2 text-muted">
      Connected to {{ data?.workspace.name }} ({{ data?.workspace.siteUrl }}).
    </p>
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
    <UButton class="mt-6" variant="outline" data-testid="logout" @click="logout">Sign out</UButton>
  </UContainer>
</template>
