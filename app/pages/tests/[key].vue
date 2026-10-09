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
  base?: { summary: string; labels: string[]; status: string }
}

const route = useRoute()
const { workspace } = useWorkspaceSession()
const projectDraftCount = useState<number>('project-draft-count', () => 0)
const draftReady = ref(false)
const draftLoadError = ref('')
const hasDraft = ref(false)
const baseFields = ref<{ summary: string; labels: string[]; status: string } | null>(null)
const key = computed(() => String(route.params.key ?? ''))
const projectId = computed(() => typeof route.query.project === 'string' ? route.query.project : '')

// Details are fetched fresh on every open and are never cached client-side.
const { data, error, status, refresh } = await useFetch<TestDetail>(
  () => `/api/tests/by-key/${encodeURIComponent(key.value)}?project=${encodeURIComponent(projectId.value)}`,
  { key: () => `test-detail-${projectId.value}-${key.value}`, lazy: true, getCachedData: () => undefined },
)

const notFound = computed(() => error.value?.statusCode === 404)
const editableFields = ref<{ summary: string; labels: string[]; status: string } | null>(null)
const hydratedDetail = ref<{ summary: string; labels: string[]; status: string; testType: string; readOnly: boolean } | null>(null)
const isReadOnly = computed(() => hydratedDetail.value?.readOnly ?? data.value?.readOnly ?? true)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const validationError = ref('')
let saveVersion = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined
let saveInFlight = false
let pendingPatch: Partial<{ summary: string; labels: string[]; status: string }> = {}

watch(data, (value) => { if (value && import.meta.client) void loadDraft() }, { immediate: true })
const projectInfo = useFetch<{ statuses: Array<{ name: string }> }>(
  () => `/api/project?project=${encodeURIComponent(projectId.value)}`,
  { key: () => `project-info-${projectId.value}`, watch: [projectId], lazy: true },
)
const statuses = computed(() => projectInfo.data.value?.statuses.map((status) => status.name) ?? [])

async function loadDraft() {
  if (!data.value?.id || !projectId.value) return
  try {
    draftReady.value = false
    draftLoadError.value = ''
    const prepared = await $fetch<{ values: Array<{ id: string; fields: { summary: string; labels: string[]; status: string }; base: { summary: string; labels: string[]; status: string }; changed: boolean; readOnly: boolean; testType: string; summary: string; labels: string[]; status: string }> }>('/api/tests/selection', {
      method: 'POST', headers: { origin: window.location.origin }, query: { project: projectId.value }, body: { ids: [data.value.id] },
    })
    const current = prepared.values[0]
    if (!current) throw new Error('Test details could not be prepared for editing.')
    hydratedDetail.value = {
      readOnly: Boolean(current.readOnly),
      testType: String(current.testType),
      summary: String(current.summary),
      labels: current.labels as string[],
      status: String(current.status),
    }
    baseFields.value = { ...current.base }
    hasDraft.value = Boolean(current.changed)
    editableFields.value = { ...current.fields }
    const result = current.changed
      ? await $fetch<{ fields: { summary: string; labels: string[]; status: string }; count: number }>(`/api/drafts/${encodeURIComponent(data.value.id)}?project=${encodeURIComponent(projectId.value)}`)
      : { fields: current.fields, count: projectDraftCount.value }
    editableFields.value = { ...result.fields }
    projectDraftCount.value = result.count
    draftReady.value = true
    draftLoadError.value = ''
  } catch (error) {
    draftReady.value = false
    draftLoadError.value = error instanceof Error ? error.message : 'Test details could not be prepared for editing.'
  }
}

function queueSave(field: 'summary' | 'labels' | 'status', value: string | string[]) {
  if (!data.value || isReadOnly.value || !draftReady.value) return
  editableFields.value = { ...(editableFields.value ?? { summary: data.value.summary, labels: data.value.labels, status: data.value.status }), [field]: value }
  const invalid = field === 'summary' && (!(value as string).trim() || (value as string).length > 255)
    ? (!(value as string).trim() ? 'Summary is required.' : 'Summary must be 255 characters or fewer.')
    : field === 'labels' && (value as string[]).some((label) => /\s/.test(label))
      ? 'Jira labels cannot contain spaces'
      : field === 'status' && !statuses.value.includes(value as string)
        ? 'Choose a status available for the Test issue type.' : ''
  validationError.value = invalid
  if (invalid) return
  saveVersion += 1
  pendingPatch = { ...pendingPatch, [field]: value }
  if (saveTimer) clearTimeout(saveTimer)
  saveState.value = 'saving'
  saveTimer = setTimeout(() => { void flushPendingSave() }, 500)
}

async function flushPendingSave() {
  if (!data.value?.id || !Object.keys(pendingPatch).length) return
  if (saveInFlight) {
    saveTimer = setTimeout(() => { void flushPendingSave() }, 25)
    return
  }
  const patch = pendingPatch
  pendingPatch = {}
  saveInFlight = true
  const version = saveVersion
  try {
    const result = await $fetch<{ count: number; fields: { summary: string; labels: string[]; status: string } }>(`/api/drafts/${encodeURIComponent(data.value.id)}?project=${encodeURIComponent(projectId.value)}`, { method: 'PUT', headers: { origin: window.location.origin }, body: patch })
      if (version === saveVersion) {
        editableFields.value = { ...result.fields }
        hasDraft.value = true
        projectDraftCount.value = result.count
        saveState.value = 'saved'
      }
  } catch {
    if (version === saveVersion) {
      saveState.value = 'error'
      validationError.value = 'Draft could not be saved. Retry.'
    }
    pendingPatch = { ...patch, ...pendingPatch }
    if (version === saveVersion) saveTimer = setTimeout(() => { void flushPendingSave() }, 1_000)
  } finally {
    saveInFlight = false
    if (Object.keys(pendingPatch).length) saveTimer = setTimeout(() => { void flushPendingSave() }, 25)
  }
}

async function undoAll() {
  if (!data.value?.id) return
  if (saveTimer) clearTimeout(saveTimer)
  saveVersion += 1
  pendingPatch = {}
  while (saveInFlight) await new Promise((resolve) => setTimeout(resolve, 10))
  try {
    const result = await $fetch<{ count: number }>(`/api/drafts/${encodeURIComponent(data.value.id)}?project=${encodeURIComponent(projectId.value)}`, { method: 'DELETE', headers: { origin: window.location.origin } })
    editableFields.value = baseFields.value ?? {
      summary: hydratedDetail.value?.summary ?? data.value.summary,
      labels: hydratedDetail.value?.labels ?? data.value.labels,
      status: hydratedDetail.value?.status ?? data.value.status,
    }
    projectDraftCount.value = result.count
    hasDraft.value = false
    saveState.value = 'idle'
    validationError.value = ''
  } catch { saveState.value = 'error' }
}

onBeforeUnmount(() => { if (saveTimer) clearTimeout(saveTimer) })
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
            <dd v-if="!isReadOnly && draftReady"><input data-testid="test-summary-input" class="w-full rounded border border-default bg-elevated px-2 py-1" :value="editableFields?.summary ?? hydratedDetail?.summary ?? data.summary" @input="queueSave('summary', ($event.target as HTMLInputElement).value)" /></dd>
            <dd v-else data-testid="test-summary">{{ hydratedDetail?.summary ?? data.summary }}</dd>
          </div>
          <div>
            <dt class="text-xs font-semibold text-muted">Status</dt>
            <dd v-if="!isReadOnly && draftReady"><select data-testid="test-status-select" class="rounded border border-default bg-elevated px-2 py-1" :value="editableFields?.status ?? hydratedDetail?.status ?? data.status" @change="queueSave('status', ($event.target as HTMLSelectElement).value)"><option v-for="statusName in statuses" :key="statusName" :value="statusName">{{ statusName }}</option></select></dd>
            <dd v-else data-testid="test-status">{{ hydratedDetail?.status ?? data.status }}</dd>
          </div>
          <div>
            <dt class="text-xs font-semibold text-muted">Labels</dt>
            <dd class="flex flex-wrap gap-1" data-testid="test-labels">
              <AppChip v-for="label in editableFields?.labels ?? hydratedDetail?.labels ?? data.labels" :key="label">{{ label }}</AppChip>
              <span v-if="!(editableFields?.labels ?? hydratedDetail?.labels ?? data.labels).length" class="text-muted">None</span>
            </dd>
            <input v-if="!isReadOnly && draftReady" aria-label="Labels, comma separated" class="mt-1 w-full rounded border border-default bg-elevated px-2 py-1" :value="(editableFields?.labels ?? hydratedDetail?.labels ?? data.labels).join(', ')" @change="queueSave('labels', ($event.target as HTMLInputElement).value.split(',').map((label) => label.trim()).filter(Boolean))" />
          </div>
          <div>
            <dt class="text-xs font-semibold text-muted">Type</dt>
            <dd data-testid="test-type">
              {{ hydratedDetail?.testType ?? data.testType }}<span v-if="isReadOnly" class="text-muted"> · read-only</span>
            </dd>
          </div>
        </dl>
        <p v-if="validationError" role="alert" class="mt-2 text-sm text-error">{{ validationError }}</p>
        <p v-if="saveState !== 'idle'" role="status" class="mt-2 text-sm text-muted">{{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save failed — edit to retry.' }}</p>
        <div v-if="draftLoadError" role="alert" class="mt-2 text-sm text-muted">
          {{ draftLoadError }}
          <UButton variant="link" class="ml-1 p-0" @click="loadDraft">Retry editing details</UButton>
        </div>
        <UButton v-if="!isReadOnly && draftReady" class="mt-3" variant="outline" color="neutral" data-testid="undo-all" :disabled="!hasDraft" @click="undoAll">Undo all</UButton>
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
