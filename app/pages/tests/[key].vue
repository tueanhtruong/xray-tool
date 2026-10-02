<script setup lang="ts">
import { jiraIssueUrl } from '#shared/jira/issue-url'

interface TestDetail {
  id: string
  key: string
  summary: string
  folderPath: string | null
  labels: string[]
  status: string
  testType: string
  gherkin: string | null
  readOnly: boolean
}

const route = useRoute()
const { workspace } = useWorkspaceSession()
const key = computed(() => String(route.params.key ?? ''))
const projectId = computed(() => typeof route.query.project === 'string' ? route.query.project : '')

// Details are fetched fresh on every open and are never cached client-side.
const { data, error, status, refresh } = await useFetch<TestDetail>(
  () => `/api/tests/by-key/${encodeURIComponent(key.value)}?project=${encodeURIComponent(projectId.value)}`,
  { key: () => `test-detail-${projectId.value}-${key.value}`, lazy: true, getCachedData: () => undefined },
)

const notFound = computed(() => error.value?.statusCode === 404)
const backTo = computed(() => {
  const query: Record<string, string> = {}
  for (const name of ['project', 'folder', 'q', 'descendants'] as const) {
    const value = route.query[name]
    if (typeof value === 'string' && value) query[name] = value
  }
  return { path: '/repository', query }
})

useHead({ title: computed(() => `${key.value} · XrayBulk`) })
</script>

<template>
  <main
    class="mx-auto grid max-w-[1800px] grid-cols-1 gap-4 px-5 py-4 min-[800px]:grid-cols-[300px_1fr]"
  >
    <div>
      <NuxtLink
        :to="backTo"
        class="text-muted hover:text-highlighted"
        data-testid="back-to-repository"
      >
        ← Back to repository
      </NuxtLink>
    </div>
    <div class="hidden min-[800px]:block" />

    <LoadingSkeleton
      v-if="status === 'pending' && !data"
      class="min-[800px]:col-span-2"
      label="Loading test details"
    />

    <PageCard v-else-if="notFound" class="min-[800px]:col-span-2" data-testid="test-not-found">
      <EmptyState
        title="Test not found"
        :description="`${key} is not in the cached index for this project.`"
      >
        <NuxtLink :to="backTo" class="font-medium text-primary underline"
          >Back to repository</NuxtLink
        >
      </EmptyState>
    </PageCard>

    <ErrorBanner
      v-else-if="error"
      class="min-[800px]:col-span-2"
      title="Test details could not be loaded."
      message="Xray did not return this test. Check the connection and try again."
      retryable
      @retry="refresh()"
    />

    <template v-else-if="data">
      <PageCard data-testid="test-details">
        <h1 class="text-base font-semibold text-primary" data-testid="test-key">{{ data.key }}</h1>
        <dl class="mt-3 space-y-3">
          <div>
            <dt class="text-xs font-semibold text-muted">Summary</dt>
            <dd data-testid="test-summary">{{ data.summary }}</dd>
          </div>
          <div>
            <dt class="text-xs font-semibold text-muted">Status</dt>
            <dd data-testid="test-status">{{ data.status }}</dd>
          </div>
          <div>
            <dt class="text-xs font-semibold text-muted">Labels</dt>
            <dd class="flex flex-wrap gap-1" data-testid="test-labels">
              <AppChip v-for="label in data.labels" :key="label">{{ label }}</AppChip>
              <span v-if="!data.labels.length" class="text-muted">None</span>
            </dd>
          </div>
          <div>
            <dt class="text-xs font-semibold text-muted">Type</dt>
            <dd data-testid="test-type">
              {{ data.testType }}<span v-if="data.readOnly" class="text-muted"> · read-only</span>
            </dd>
          </div>
        </dl>
        <a
          v-if="workspace?.siteUrl"
          :href="jiraIssueUrl(workspace.siteUrl, data.key)"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-4 inline-block font-medium text-primary underline"
          >Open in Jira</a
        >
      </PageCard>

      <PageCard title="Gherkin steps" data-testid="test-gherkin" class="overflow-auto">
        <GherkinCode :source="data.gherkin ?? 'No Gherkin definition'" />
      </PageCard>
    </template>
  </main>
</template>
