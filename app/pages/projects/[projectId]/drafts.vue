<script setup lang="ts">
interface DraftsResponse {
  project: { id: string; key: string; name: string }
  count: number
  values: Array<{
    id: string
    key: string
    summary: string | null
    folderPath: string | null
    remoteDeletedAt: string | null
    updatedAt: string
    localFields: { summary: string | null; gherkin: string | null }
  }>
}

const route = useRoute()
const projectId = computed(() => String(route.params.projectId ?? ''))
const { data, error, status, refresh } = await useFetch<DraftsResponse>(
  () => `/api/projects/${encodeURIComponent(projectId.value)}/drafts`,
  { key: () => `project-drafts-${projectId.value}` },
)

useHead({ title: computed(() => `Drafts · ${data.value?.project.key ?? 'Project'} · XrayBulk`) })
</script>

<template>
  <main class="mx-auto max-w-5xl space-y-4 px-5 py-8">
    <NuxtLink
      :to="{ path: '/repository', query: { project: projectId } }"
      class="text-primary underline"
      >← Back to repository</NuxtLink
    >
    <PageCard :title="`Drafts · ${data?.project.key ?? ''}`" :description="data?.project.name">
      <LoadingSkeleton v-if="status === 'pending' && !data" label="Loading drafts" />
      <ErrorBanner
        v-else-if="error"
        title="Drafts could not be loaded."
        message="Check project access and try again."
        retryable
        @retry="refresh()"
      />
      <EmptyState
        v-else-if="!data?.values.length"
        title="No drafts for this project"
        description="Your project context is unchanged."
      />
      <ul v-else class="divide-y divide-default">
        <li
          v-for="draft in data.values"
          :key="draft.id"
          class="flex flex-wrap items-center justify-between gap-2 py-3"
        >
          <div>
            <p class="font-medium">
              {{ draft.key }} · {{ draft.localFields.summary ?? draft.summary }}
            </p>
            <p class="text-sm text-muted">
              {{ draft.folderPath ?? 'No folder'
              }}<span v-if="draft.remoteDeletedAt"> · Removed from Xray</span>
            </p>
          </div>
          <time class="text-sm text-muted">{{ new Date(draft.updatedAt).toLocaleString() }}</time>
        </li>
      </ul>
    </PageCard>
  </main>
</template>
