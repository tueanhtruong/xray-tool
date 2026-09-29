<script setup lang="ts">
const appName = 'Xray Tool'
const { data } = await useFetch<{ workspace: { name: string; siteUrl: string } }>(
  '/api/auth/session',
)
const { clear } = useUserSession()

async function logout() {
  await $fetch('/auth/logout', {
    method: 'POST',
    headers: import.meta.server ? undefined : { origin: window.location.origin },
  })
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
    <UButton class="mt-6" variant="outline" data-testid="logout" @click="logout">Sign out</UButton>
  </UContainer>
</template>
