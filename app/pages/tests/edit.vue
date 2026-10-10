<script setup lang="ts">
import type { EditSelectionItem } from '~/composables/useEditSelection'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type DraftPatch = Partial<{ summary: string; gherkin: string }>

interface PreparedTest {
  id: string
  key: string
  testType: string
  readOnly: boolean
  summary: string
  gherkin: string | null
  base: { summary: string; gherkin: string | null }
  fields: { summary: string; gherkin: string | null }
  changed: boolean
  draftAvailable: boolean
}

const SAVE_DEBOUNCE_MS = 500

const route = useRoute()
const { selection, load, patchItem } = useEditSelection()
const projectId = computed(() =>
  typeof route.query.project === 'string' ? route.query.project : '',
)
const items = computed<EditSelectionItem[]>(() => selection.value?.items ?? [])
const activeIndex = ref(0)
const active = computed(() => items.value[activeIndex.value] ?? null)
const detail = ref<PreparedTest | null>(null)
const loading = ref(false)
const loadError = ref('')
const summaryDraft = ref('')
const gherkinDraft = ref('')
const summaryError = ref('')
const compare = ref<{ nextChange: () => void; previousChange: () => void }>()
const rowStates = reactive(new Map<string, SaveState>())
const rowErrors = reactive(new Map<string, string>())
const pending = new Map<string, DraftPatch>()
const failed = new Map<string, DraftPatch>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const inFlight = new Set<string>()

const backTo = computed(() => {
  const folder = active.value?.folderPath
  return {
    path: '/repository',
    query: {
      project: projectId.value || undefined,
      folder: folder && folder !== '/' ? folder : undefined,
    },
  }
})
const saveState = computed<SaveState>(() =>
  active.value ? (rowStates.get(active.value.id) ?? 'idle') : 'idle',
)
const saveText = computed(
  () => ({ idle: '', saving: 'Saving…', saved: 'Saved', error: 'Save failed' })[saveState.value],
)
const isReadOnly = computed(() => detail.value?.readOnly ?? true)
const draftBlocked = computed(() => detail.value !== null && !detail.value.draftAvailable)
const canEdit = computed(() => detail.value !== null && !isReadOnly.value && !draftBlocked.value)
const baseGherkin = computed(() => detail.value?.base.gherkin ?? '')
const hasNoGherkin = computed(() => detail.value !== null && detail.value.gherkin === null)
const busy = computed(() =>
  [...rowStates.values()].some((state) => state === 'saving' || state === 'error'),
)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === 'object' &&
    'data' in error &&
    error.data &&
    typeof error.data === 'object' &&
    'message' in error.data &&
    typeof error.data.message === 'string'
  ) {
    return error.data.message
  }
  return fallback
}

function schedule(id: string) {
  clearTimeout(timers.get(id))
  timers.set(
    id,
    setTimeout(() => void flush(id), SAVE_DEBOUNCE_MS),
  )
}

function queueSave(id: string, patch: DraftPatch) {
  pending.set(id, { ...pending.get(id), ...patch })
  failed.delete(id)
  rowStates.set(id, 'saving')
  schedule(id)
}

async function flush(id: string) {
  if (inFlight.has(id)) return
  const patch = pending.get(id)
  if (!patch) return
  pending.delete(id)
  inFlight.add(id)
  rowStates.set(id, 'saving')
  try {
    const result = await $fetch<{ changed: boolean }>(`/api/drafts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      query: { project: projectId.value },
      headers: { origin: window.location.origin },
      body: patch,
    })
    patchItem(id, { hasDraft: result.changed })
    rowStates.set(id, 'saved')
  } catch (error) {
    failed.set(id, patch)
    rowErrors.set(id, errorMessage(error, 'Draft could not be saved. Retry.'))
    rowStates.set(id, 'error')
  } finally {
    inFlight.delete(id)
  }
  if (pending.has(id)) schedule(id)
}

async function drain(id: string) {
  clearTimeout(timers.get(id))
  while (inFlight.has(id)) await sleep(10)
  await flush(id)
}

function retry(id: string) {
  const patch = failed.get(id)
  if (!patch) return
  failed.delete(id)
  pending.set(id, { ...patch, ...pending.get(id) })
  void flush(id)
}

async function loadActive() {
  const current = active.value
  if (!current) return
  loading.value = true
  loadError.value = ''
  detail.value = null
  try {
    const result = await $fetch<{ values: PreparedTest[]; failures: Array<{ message: string }> }>(
      '/api/tests/selection',
      {
        method: 'POST',
        query: { project: projectId.value },
        headers: { origin: window.location.origin },
        body: { ids: [current.id] },
      },
    )
    const value = result.values[0]
    if (!value) {
      loadError.value =
        result.failures[0]?.message ?? 'Test details could not be prepared for editing.'
      return
    }
    detail.value = value
    summaryDraft.value = value.fields.summary
    gherkinDraft.value = value.fields.gherkin ?? ''
    summaryError.value = ''
    patchItem(current.id, { summary: value.fields.summary, hasDraft: value.changed })
  } catch (error) {
    loadError.value = errorMessage(error, 'Test details could not be loaded. Try again.')
  } finally {
    loading.value = false
  }
}

async function openIndex(index: number) {
  if (items.value.length === 0) return
  const previous = active.value?.id
  if (previous) await drain(previous)
  activeIndex.value = Math.max(0, Math.min(items.value.length - 1, index))
  await loadActive()
}

function onSummaryInput(value: string) {
  summaryDraft.value = value
  const current = active.value
  if (!current || !canEdit.value) return
  summaryError.value = !value.trim()
    ? 'Summary is required.'
    : value.length > 255
      ? 'Summary must be 255 characters or fewer.'
      : ''
  if (summaryError.value) {
    const patch = pending.get(current.id)
    if (patch) delete patch.summary
    return
  }
  queueSave(current.id, { summary: value })
}

function onGherkinChange(value: string) {
  gherkinDraft.value = value
  const current = active.value
  if (!current || !canEdit.value) return
  queueSave(current.id, { gherkin: value })
}

async function revertTest() {
  const current = active.value
  if (!current || !detail.value) return
  pending.delete(current.id)
  failed.delete(current.id)
  await drain(current.id)
  try {
    await $fetch(`/api/drafts/${encodeURIComponent(current.id)}`, {
      method: 'DELETE',
      query: { project: projectId.value },
      headers: { origin: window.location.origin },
    })
    summaryDraft.value = detail.value.base.summary
    gherkinDraft.value = baseGherkin.value
    summaryError.value = ''
    patchItem(current.id, { hasDraft: false })
    rowStates.set(current.id, 'saved')
  } catch (error) {
    rowErrors.set(current.id, errorMessage(error, 'The draft could not be reverted. Retry.'))
    rowStates.set(current.id, 'error')
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!event.altKey) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    void openIndex(activeIndex.value + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    void openIndex(activeIndex.value - 1)
  }
}

onBeforeRouteLeave(() => {
  if (busy.value && !window.confirm('Changes are still saving or failed to save. Leave this page?'))
    return false
})

onMounted(async () => {
  const current = load()
  if (
    !current ||
    current.items.length === 0 ||
    (projectId.value && projectId.value !== current.projectId)
  ) {
    await navigateTo(
      {
        path: '/repository',
        query: {
          project: projectId.value || current?.projectId || undefined,
          notice: 'edit-no-selection',
        },
      },
      { replace: true },
    )
    return
  }
  await loadActive()
})

useHead({ title: computed(() => `${active.value?.key ?? 'Edit'} · XrayBulk`) })
</script>

<template>
  <ClientOnly>
    <div
      class="grid min-h-[calc(100vh-3.25rem)] grid-cols-1 min-[800px]:grid-cols-[260px_minmax(0,1fr)]"
      data-testid="edit-compare"
      @keydown="onKeydown"
    >
      <aside
        class="border-b border-default bg-elevated p-3 min-[800px]:border-b-0 min-[800px]:border-r"
        aria-label="Selected tests"
        data-testid="edit-rail"
      >
        <p class="mb-2 text-xs text-muted" data-testid="edit-position">
          {{ items.length ? activeIndex + 1 : 0 }} / {{ items.length }}
        </p>
        <ol class="space-y-1">
          <li v-for="(item, index) in items" :key="item.id">
            <button
              type="button"
              class="w-full rounded px-2 py-1 text-left hover:bg-muted"
              :class="index === activeIndex ? 'bg-(--soft)' : ''"
              :aria-current="index === activeIndex ? 'true' : undefined"
              :data-testid="`rail-${item.key}`"
              @click="openIndex(index)"
            >
              <span class="font-semibold">{{ item.key }}</span>
              <span v-if="item.hasDraft" class="ml-1 text-primary" aria-label="Has draft">•</span>
              <span class="block truncate text-xs text-muted">{{ item.summary }}</span>
            </button>
          </li>
        </ol>
      </aside>

      <section class="min-w-0 p-4 min-[800px]:px-5">
        <header class="mb-3 flex flex-wrap items-center gap-3">
          <NuxtLink :to="backTo" class="text-muted underline" data-testid="back-to-repository">
            ← Back to repository
          </NuxtLink>
          <h1 class="text-lg font-semibold text-highlighted">{{ active?.key }}</h1>
          <span role="status" class="text-sm text-muted" data-testid="save-state">{{
            saveText
          }}</span>
          <button
            v-if="saveState === 'error' && active"
            type="button"
            class="text-sm text-primary underline"
            data-testid="retry-save"
            @click="retry(active.id)"
          >
            Retry save
          </button>
        </header>

        <p
          v-if="rowErrors.get(active?.id ?? '') && saveState === 'error'"
          role="alert"
          class="mb-2 text-sm text-error"
        >
          {{ rowErrors.get(active?.id ?? '') }}
        </p>
        <p v-if="loadError" role="alert" class="text-sm text-error">{{ loadError }}</p>
        <LoadingSkeleton v-else-if="loading" label="Loading test details" />

        <template v-else-if="detail">
          <label class="block text-xs font-semibold text-muted">
            Summary
            <input
              :value="summaryDraft"
              :disabled="!canEdit"
              data-testid="edit-summary"
              class="mt-1 w-full rounded border border-default bg-elevated px-2 py-1 text-sm text-default disabled:opacity-60"
              @input="onSummaryInput(($event.target as HTMLInputElement).value)"
            />
          </label>
          <p v-if="summaryError" role="alert" class="mt-1 text-xs text-error">{{ summaryError }}</p>
          <div class="mt-2 flex items-center gap-2 text-sm">
            <span class="text-muted">Folder</span>
            <FolderPathCell v-if="active" :path="active.folderPath" :test-id="active.id" />
          </div>

          <p
            v-if="isReadOnly"
            class="mt-3 rounded border border-default bg-elevated px-3 py-2 text-sm"
            data-testid="read-only-banner"
          >
            This test is read-only in Xray, so its summary and Gherkin cannot be edited here.
          </p>
          <p
            v-else-if="draftBlocked"
            class="mt-3 rounded border border-default bg-elevated px-3 py-2 text-sm"
          >
            This existing draft has no safe original baseline and cannot be edited here.
          </p>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <UButton
              variant="outline"
              color="neutral"
              data-testid="previous-change"
              :disabled="hasNoGherkin"
              @click="compare?.previousChange()"
              >Previous change</UButton
            >
            <UButton
              variant="outline"
              color="neutral"
              data-testid="next-change"
              :disabled="hasNoGherkin"
              @click="compare?.nextChange()"
              >Next change</UButton
            >
            <UButton
              variant="outline"
              color="neutral"
              data-testid="revert-test"
              :disabled="!active?.hasDraft || !canEdit"
              @click="revertTest"
              >Revert test</UButton
            >
          </div>

          <div v-if="hasNoGherkin" class="mt-3 grid gap-3 md:grid-cols-2" data-testid="no-gherkin">
            <PageCard
              ><p class="text-sm text-muted">
                No Gherkin for test type: {{ detail.testType }}
              </p></PageCard
            >
            <PageCard
              ><p class="text-sm text-muted">
                No Gherkin for test type: {{ detail.testType }}
              </p></PageCard
            >
          </div>
          <div v-else class="mt-3">
            <div class="mb-1 flex text-xs font-semibold text-muted">
              <span class="w-1/2">Xray baseline (read-only)</span>
              <span class="w-1/2">Draft (editable)</span>
            </div>
            <GherkinCompare
              ref="compare"
              :key="detail.id"
              :base="baseGherkin"
              :model-value="gherkinDraft"
              :read-only="!canEdit"
              @update:model-value="onGherkinChange"
            />
          </div>
        </template>
      </section>
    </div>
  </ClientOnly>
</template>
