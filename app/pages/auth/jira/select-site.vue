<script setup lang="ts">
interface JiraSiteOption {
  cloudId: string
  name: string
  url: string
}

const { data, error } = await useFetch<{ sites: JiraSiteOption[] }>('/api/auth/jira/sites')
const selected = ref('')
const submitting = ref(false)
const message = ref('')

async function chooseSite() {
  if (!selected.value) return
  submitting.value = true
  message.value = ''
  try {
    await $fetch('/api/auth/jira/select-site', {
      method: 'POST',
      body: { cloudId: selected.value },
    })
    window.location.assign('/')
  } catch {
    message.value = 'Could not connect that Jira site. Please sign in again.'
    submitting.value = false
  }
}

useHead({ title: 'Choose a Jira site · Xray Tool' })
</script>

<template>
  <UContainer class="max-w-lg py-16">
    <h1 class="text-3xl font-semibold">Choose a Jira site</h1>
    <p class="mt-2 text-muted">Choose which accessible site this workspace should connect to.</p>
    <UAlert
      v-if="error || message"
      class="mt-6"
      color="error"
      :title="message || 'This sign-in expired. Please sign in again.'"
    />
    <form v-else class="mt-8 space-y-5" @submit.prevent="chooseSite">
      <label
        v-for="site in data?.sites ?? []"
        :key="site.cloudId"
        class="flex items-start gap-3 rounded border p-4"
      >
        <input v-model="selected" type="radio" name="site" :value="site.cloudId" required />
        <span>
          <span class="block font-medium">{{ site.name }}</span>
          <span class="text-sm text-muted">{{ site.url }}</span>
        </span>
      </label>
      <UButton type="submit" :disabled="!selected || submitting" data-testid="select-site">
        {{ submitting ? 'Connecting…' : 'Continue' }}
      </UButton>
    </form>
  </UContainer>
</template>
