<script setup lang="ts">
const route = useRoute()
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
  </UContainer>
</template>
