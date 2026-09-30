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
    const result = await $fetch<{ redirectTo: string }>('/api/auth/jira/select-site', {
      method: 'POST',
      body: { cloudId: selected.value },
    })
    window.location.assign(result.redirectTo)
  } catch {
    message.value = 'Could not connect that Jira site. Please sign in again.'
    submitting.value = false
  }
}

useHead({ title: 'Choose a Jira site · Xray Tool' })
</script>

<template>
  <main class="mx-auto my-12 max-w-[420px] px-4">
    <PageCard>
      <h1 class="text-xl font-semibold text-highlighted">Choose a Jira site</h1>
      <p class="mt-1 text-muted">Choose which accessible site this workspace should connect to.</p>
      <ErrorBanner
        v-if="error || message"
        class="mt-4"
        :message="message || 'This sign-in expired. Please sign in again.'"
      />
      <form v-else class="mt-4 space-y-3" @submit.prevent="chooseSite">
        <label
          v-for="site in data?.sites ?? []"
          :key="site.cloudId"
          class="flex cursor-pointer items-start gap-3 rounded-lg border border-default p-4 has-[:checked]:border-primary has-[:checked]:bg-(--soft)"
        >
          <input v-model="selected" type="radio" name="site" :value="site.cloudId" required class="mt-1" />
          <span>
            <span class="block font-medium text-highlighted">{{ site.name }}</span>
            <span class="text-sm text-muted">{{ site.url }}</span>
          </span>
        </label>
        <button
          type="submit"
          class="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-inverted hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="!selected || submitting"
          data-testid="select-site"
        >
          {{ submitting ? 'Connecting…' : 'Continue' }}
        </button>
      </form>
    </PageCard>
  </main>
</template>
