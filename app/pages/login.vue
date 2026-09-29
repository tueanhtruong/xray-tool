<script setup lang="ts">
const route = useRoute()
const apiTokenError = ref('')
const existingConnection = ref(false)
const apiTokenForm = reactive({ siteUrl: '', email: '', apiToken: '' })
const apiTokenPending = ref(false)
const message = computed(() => {
  const value = route.query.message
  if (value === 'access-denied')
    return 'Atlassian access was not granted. You can try again when ready.'
  if (value === 'verification-failed') return 'Sign-in could not be verified. Please try again.'
  if (value === 'configuration') {
    const missing =
      typeof route.query.missing === 'string' ? route.query.missing : 'Atlassian OAuth settings'
    return `Sign-in is not configured. Set ${missing} in .env. See docs/setup-atlassian-oauth.md.`
  }
  if (value === 'oauth-failed') {
    return typeof route.query.detail === 'string'
      ? route.query.detail
      : 'Atlassian sign-in could not be completed. Please try again.'
  }
  if (typeof value === 'string' && value.length > 0) return value
  return ''
})

async function signInWithApiToken() {
  apiTokenError.value = ''
  existingConnection.value = false
  apiTokenPending.value = true
  try {
    await $fetch('/api/auth/jira/api-token', {
      method: 'POST',
      body: { ...apiTokenForm },
    })
    await navigateTo('/')
  } catch (error) {
    existingConnection.value = Boolean(
      error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 409,
    )
    apiTokenError.value =
      error && typeof error === 'object' && 'data' in error &&
      error.data && typeof error.data === 'object' && 'message' in error.data &&
      typeof error.data.message === 'string'
        ? error.data.message
        : 'Jira sign-in could not be completed. Please try again.'
  } finally {
    apiTokenPending.value = false
    apiTokenForm.apiToken = ''
  }
}

useHead({ title: 'Sign in · Xray Tool' })
</script>

<template>
  <UContainer class="max-w-lg py-16">
    <h1 class="text-3xl font-semibold">Sign in to Xray Tool</h1>
    <p class="mt-2 text-muted">Connect your Atlassian account to work with your Jira site.</p>
    <UAlert
      v-if="message"
      class="mt-6"
      color="error"
      :title="message"
      data-testid="login-message"
    />
    <a
      class="mt-8 inline-flex items-center rounded-md bg-primary px-4 py-2 font-medium text-inverted"
      href="/auth/jira/login"
      data-testid="jira-login"
      >Sign in with Atlassian</a
    >
    <USeparator class="my-8" label="or" />
    <form class="space-y-4" data-testid="api-token-form" @submit.prevent="signInWithApiToken">
      <h2 class="text-xl font-semibold">Use a Jira API token instead</h2>
      <UFormField label="Jira site URL" name="siteUrl">
        <UInput v-model="apiTokenForm.siteUrl" type="url" required placeholder="https://acme.atlassian.net" />
      </UFormField>
      <UFormField label="Atlassian email" name="email">
        <UInput v-model="apiTokenForm.email" type="email" required autocomplete="username" />
      </UFormField>
      <UFormField label="API token" name="apiToken">
        <UInput v-model="apiTokenForm.apiToken" type="password" required autocomplete="current-password" />
      </UFormField>
      <div v-if="apiTokenError" class="space-y-3" data-testid="api-token-error">
        <UAlert color="error" :title="apiTokenError" />
        <a
          v-if="existingConnection"
          class="inline-flex items-center rounded-md bg-primary px-4 py-2 font-medium text-inverted"
          href="/auth/jira/login"
          data-testid="open-existing-connection"
        >
          Sign in with Atlassian to manage connection
        </a>
      </div>
      <UButton type="submit" :loading="apiTokenPending" data-testid="api-token-submit">
        Connect Jira
      </UButton>
    </form>
  </UContainer>
</template>
