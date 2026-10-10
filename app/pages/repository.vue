<script setup lang="ts">
import type { FolderNode } from '~/components/FolderTree.vue'
import type { RepositoryTest } from '~/components/TestList.vue'

interface Page {
  values: RepositoryTest[]
  total: number
  limit: number
  offset: number
  nextOffset: number | null
  project: { id: string; key: string; name: string }
  draftCount: number
}

const PAGE_SIZE = 50
const SIDEBAR_MIN_WIDTH = 150
const SIDEBAR_MAX_WIDTH = 500
const SIDEBAR_RESIZE_STEP = 16

const route = useRoute()
const router = useRouter()
const { workspace, refresh: refreshSession } = useWorkspaceSession()
const currentProjectId = computed(() => workspace.value?.currentProjectId ?? null)

const selectedFolder = computed(() =>
  typeof route.query.folder === 'string' ? route.query.folder : '',
)
const search = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const includeDescendants = computed(() => route.query.descendants === 'true')
const offset = computed(() => Number(route.query.offset ?? 0) || 0)
const sidebarWidth = ref(260)
const isResizingSidebar = ref(false)
let resizeStartX = 0
let resizeStartWidth = sidebarWidth.value

function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, width))
}

function onSidebarResizePointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  resizeStartX = event.clientX
  resizeStartWidth = sidebarWidth.value
  isResizingSidebar.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}

function onSidebarResizePointerMove(event: PointerEvent) {
  if (!isResizingSidebar.value) return
  sidebarWidth.value = clampSidebarWidth(resizeStartWidth + event.clientX - resizeStartX)
}

function stopSidebarResize() {
  isResizingSidebar.value = false
}

function onSidebarResizeKeydown(event: KeyboardEvent) {
  let nextWidth: number
  switch (event.key) {
    case 'ArrowLeft':
      nextWidth = sidebarWidth.value - SIDEBAR_RESIZE_STEP
      break
    case 'ArrowRight':
      nextWidth = sidebarWidth.value + SIDEBAR_RESIZE_STEP
      break
    case 'Home':
      nextWidth = SIDEBAR_MIN_WIDTH
      break
    case 'End':
      nextWidth = SIDEBAR_MAX_WIDTH
      break
    default:
      return
  }
  event.preventDefault()
  sidebarWidth.value = clampSidebarWidth(nextWidth)
}

const folderQuery = await useFetch<{ folders: FolderNode[]; foldersPulledAt: string | null }>(
  '/api/folders',
  { query: computed(() => ({ project: currentProjectId.value ?? '' })), watch: [currentProjectId] },
)
const filters = computed(() => ({
  folder: selectedFolder.value || undefined,
  q: search.value || undefined,
  includeDescendants: includeDescendants.value ? 'true' : 'false',
  offset: String(offset.value),
  limit: String(PAGE_SIZE),
}))
const testQuery = useFetch<Page>('/api/tests', {
  query: computed(() => ({ ...filters.value, project: currentProjectId.value ?? '' })),
  watch: [filters, currentProjectId],
  lazy: true,
  key: () => `repository-tests-${currentProjectId.value}`,
})

const tests = computed(() => testQuery.data.value?.values ?? [])
const total = computed(() => testQuery.data.value?.total ?? 0)
const projectDraftCount = useState<number>('project-draft-count', () => 0)
const hydratedState = reactive(new Map<string, Partial<RepositoryTest>>())
const localFields = reactive(new Map<string, { summary: string; gherkin: string | null }>())
const saveVersions = reactive(new Map<string, number>())
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const saving = reactive(new Set<string>())
const pendingSave = reactive(new Map<string, { version: number; patch: { summary?: string } }>())
const savePayloads = reactive(new Map<string, { summary?: string }>())
const undoStacks = reactive(new Map<string, Array<{ summary: string }>>())
const redoStacks = reactive(new Map<string, Array<{ summary: string }>>())
const testRows = computed(() =>
  tests.value.map((test) => ({
    ...test,
    ...(hydratedState.get(test.id) ?? {}),
    ...(localFields.get(test.id) ?? {}),
  })),
)
const displayedDraftCount = computed(() =>
  Math.max(projectDraftCount.value, tests.value.filter((test) => test.hasDraft).length),
)

let hydrationSignature = ''
async function hydratePage() {
  const rows = tests.value.filter((test) => !hydratedState.get(test.id)?.hydrated)
  if (!rows.length) return
  const requestProjectId = currentProjectId.value
  if (!requestProjectId) return
  const signature = `${requestProjectId}:${offset.value}:${rows.map((row) => row.id).join(',')}`
  if (signature === hydrationSignature) return
  hydrationSignature = signature
  for (const row of rows)
    hydratedState.set(row.id, {
      ...hydratedState.get(row.id),
      hydrated: false,
      hydrationError: undefined,
    })
  try {
    const result = await $fetch<{
      values: Array<Record<string, unknown>>
      failures: Array<{ id: string; message: string }>
      draftCount: number
    }>('/api/tests/selection', {
      method: 'POST',
      query: { project: requestProjectId },
      body: { ids: rows.map((row) => row.id) },
    })
    if (currentProjectId.value !== requestProjectId || hydrationSignature !== signature) return
    projectDraftCount.value = result.draftCount
    const failures = new Map(result.failures.map((failure) => [failure.id, failure.message]))
    for (const row of rows) {
      const detail = result.values.find((value) => value.id === row.id)
      if (!detail) {
        hydratedState.set(row.id, {
          ...hydratedState.get(row.id),
          hydrationError: failures.get(row.id) ?? 'Test details could not be loaded.',
        })
        continue
      }
      const fields = detail.fields as { summary: string; gherkin: string | null }
      const base = detail.base as { summary: string; gherkin: string | null } | null
      hydratedState.set(row.id, {
        ...hydratedState.get(row.id),
        summary: fields.summary,
        testType: detail.testType as string,
        gherkin: detail.gherkin as string | null,
        readOnly: detail.readOnly as boolean,
        hydrated: true,
        hydrationError: undefined,
        hasDraft: detail.changed as boolean,
        draftFields: detail.changed
          ? { summary: base && fields.summary === base.summary ? null : fields.summary }
          : null,
        baseFields: base,
      })
      localFields.set(row.id, { summary: fields.summary, gherkin: fields.gherkin })
    }
    if (failures.size) hydrationSignature = ''
  } catch {
    if (currentProjectId.value !== requestProjectId || hydrationSignature !== signature) return
    for (const row of rows)
      hydratedState.set(row.id, {
        ...hydratedState.get(row.id),
        hydrationError: 'Test details could not be loaded. Retry.',
      })
    hydrationSignature = ''
  }
}
watch(
  [tests, currentProjectId],
  () => {
    void hydratePage()
  },
  { immediate: true },
)
watch(currentProjectId, () => {
  hydratedState.clear()
  localFields.clear()
  hydrationSignature = ''
})
watch(
  () => testQuery.data.value?.draftCount,
  (count) => {
    if (count !== undefined) projectDraftCount.value = count
  },
)

async function flushPendingDraft(id: string) {
  if (saving.has(id)) return
  const pending = pendingSave.get(id)
  if (!pending) return
  saving.add(id)
  let succeeded = false
  try {
    const result = await $fetch<{
      fields: { summary: string; gherkin: string | null }
      changed: boolean
      count: number
    }>(`/api/drafts/${encodeURIComponent(id)}?project=${currentProjectId.value}`, {
      method: 'PUT',
      headers: { origin: window.location.origin },
      body: pending.patch,
    })
    projectDraftCount.value = result.count
    if (saveVersions.get(id) === pending.version) {
      localFields.set(id, { ...result.fields })
      savePayloads.delete(id)
      const base = testRows.value.find((test) => test.id === id)?.baseFields
      const changed = base ? result.fields.summary !== base.summary : result.changed
      hydratedState.set(id, { ...hydratedState.get(id), saveState: 'saved', hasDraft: changed })
    }
    succeeded = true
  } catch (error) {
    const message =
      error &&
      typeof error === 'object' &&
      'data' in error &&
      error.data &&
      typeof error.data === 'object' &&
      'message' in error.data &&
      typeof error.data.message === 'string'
        ? error.data.message
        : 'Draft could not be saved. Retry.'
    hydratedState.set(id, {
      ...hydratedState.get(id),
      saveState: 'error',
      validationError: message,
    })
  } finally {
    saving.delete(id)
    const newest = pendingSave.get(id)
    if (succeeded && newest?.version === pending.version) pendingSave.delete(id)
    else if (newest && newest.version !== pending.version) void flushPendingDraft(id)
    else if (succeeded && (saveVersions.get(id) ?? 0) !== pending.version) {
      const current = savePayloads.get(id)
      if (current) {
        pendingSave.set(id, { version: saveVersions.get(id) ?? 0, patch: { ...current } })
        void flushPendingDraft(id)
      }
    }
  }
}

function updateDraft(payload: { id: string; field: 'summary'; value: string }) {
  const current = localFields.get(payload.id)
  if (!current) return
  undoStacks.set(payload.id, [...(undoStacks.get(payload.id) ?? []), { summary: current.summary }])
  redoStacks.set(payload.id, [])
  localFields.set(payload.id, { ...current, summary: payload.value })
  savePayloads.set(payload.id, { summary: payload.value })
  saveVersions.set(payload.id, (saveVersions.get(payload.id) ?? 0) + 1)
  const version = saveVersions.get(payload.id)!
  const invalid = !payload.value.trim()
    ? 'Summary is required.'
    : payload.value.length > 255
      ? 'Summary must be 255 characters or fewer.'
      : undefined
  hydratedState.set(payload.id, {
    ...hydratedState.get(payload.id),
    validationError: invalid,
    saveState: invalid ? 'idle' : 'saving',
  })
  const old = saveTimers.get(payload.id)
  if (old) clearTimeout(old)
  if (invalid) {
    savePayloads.delete(payload.id)
    return
  }
  const base = testRows.value.find((test) => test.id === payload.id)?.baseFields
  if (base) {
    const summaryChanged = payload.value !== base.summary
    hydratedState.set(payload.id, {
      ...hydratedState.get(payload.id),
      hasDraft: summaryChanged,
      draftFields: { summary: summaryChanged ? payload.value : null },
    })
  }
  hydratedState.set(payload.id, { ...hydratedState.get(payload.id), saveState: 'saving' })
  saveTimers.set(
    payload.id,
    setTimeout(() => {
      const latestPatch = savePayloads.get(payload.id)
      if (!latestPatch || saveVersions.get(payload.id) !== version) return
      pendingSave.set(payload.id, { version, patch: { ...latestPatch } })
      void flushPendingDraft(payload.id)
    }, 500),
  )
}

async function revertDraft(id: string) {
  if (saveTimers.has(id)) clearTimeout(saveTimers.get(id))
  saveVersions.set(id, (saveVersions.get(id) ?? 0) + 1)
  savePayloads.delete(id)
  pendingSave.delete(id)
  while (saving.has(id)) await new Promise((resolve) => setTimeout(resolve, 10))
  try {
    const result = await $fetch<{ count: number }>(
      `/api/drafts/${encodeURIComponent(id)}?project=${currentProjectId.value}`,
      { method: 'DELETE', headers: { origin: window.location.origin } },
    )
    const base = testRows.value.find((test) => test.id === id)?.baseFields
    if (base) localFields.set(id, { summary: base.summary, gherkin: base.gherkin })
    hydratedState.set(id, {
      ...hydratedState.get(id),
      hasDraft: false,
      draftFields: null,
      saveState: 'idle',
    })
    projectDraftCount.value = result.count
    await refreshNuxtData()
  } catch {
    hydratedState.set(id, { ...hydratedState.get(id), saveState: 'error' })
  }
}

async function restoreDraftFields(id: string, fields: { summary: string }) {
  const current = localFields.get(id)
  if (!current) return
  const result = await $fetch<{
    fields: { summary: string; gherkin: string | null }
    count: number
  }>(`/api/drafts/${encodeURIComponent(id)}?project=${currentProjectId.value}`, {
    method: 'PUT',
    headers: { origin: window.location.origin },
    body: fields,
  })
  localFields.set(id, { summary: result.fields.summary, gherkin: result.fields.gherkin })
  projectDraftCount.value = result.count
  const base = testRows.value.find((row) => row.id === id)?.baseFields
  const summaryChanged = base ? result.fields.summary !== base.summary : true
  hydratedState.set(id, {
    ...hydratedState.get(id),
    hasDraft: summaryChanged,
    draftFields: { summary: summaryChanged ? result.fields.summary : null },
    saveState: 'saved',
  })
}

async function undoCell(id: string) {
  const stack = undoStacks.get(id) ?? []
  const previous = stack[stack.length - 1]
  if (!previous) return
  undoStacks.set(id, stack.slice(0, -1))
  redoStacks.set(id, [...(redoStacks.get(id) ?? []), { summary: localFields.get(id)!.summary }])
  await restoreDraftFields(id, previous)
}

async function redoCell(id: string) {
  const stack = redoStacks.get(id) ?? []
  const next = stack[stack.length - 1]
  if (!next) return
  redoStacks.set(id, stack.slice(0, -1))
  undoStacks.set(id, [...(undoStacks.get(id) ?? []), { summary: localFields.get(id)!.summary }])
  await restoreDraftFields(id, next)
}

function onGridKeydown(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-testcase-id]')
  const id = row?.dataset.testcaseId
  if (!id) return
  event.preventDefault()
  if (event.shiftKey) void redoCell(id)
  else void undoCell(id)
}

function retryHydration(id: string) {
  hydratedState.delete(id)
  hydrationSignature = ''
  void hydratePage()
}
function retrySave(id: string) {
  const patch = savePayloads.get(id)
  if (!patch) return
  const version = saveVersions.get(id) ?? 0
  pendingSave.set(id, { version, patch: { ...patch } })
  void flushPendingDraft(id)
}
const neverPulled = computed(() => !folderQuery.data.value?.foldersPulledAt)
const linkQuery = computed(() => {
  const query: Record<string, string> = {}
  if (currentProjectId.value) query.project = currentProjectId.value
  if (selectedFolder.value) query.folder = selectedFolder.value
  if (search.value) query.q = search.value
  if (includeDescendants.value) query.descendants = 'true'
  return query
})

const searchInput = ref(search.value)
watch(search, (value) => {
  if (value !== searchInput.value) searchInput.value = value
})
let searchTimer: ReturnType<typeof setTimeout> | undefined
function onSearchInput(value: string) {
  searchInput.value = value
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => updateQuery({ q: value.trim() || undefined }), 250)
}
onBeforeUnmount(() => clearTimeout(searchTimer))

function updateQuery(patch: Record<string, string | number | undefined>) {
  const entries = Object.entries({ ...route.query, ...patch, offset: patch.offset }).filter(
    ([, value]) => value !== undefined && value !== '',
  )
  void router.push({ query: Object.fromEntries(entries) as Record<string, string> })
}

// --- folder tree state (expansion is remembered per project)
const expanded = ref<string[]>([])
const storageKey = computed(() => `repository-folders:${currentProjectId.value}`)
watch(storageKey, () => {
  try {
    expanded.value = JSON.parse(localStorage.getItem(storageKey.value) ?? '[]') as string[]
  } catch {
    expanded.value = []
  }
})

function toggleFolder(path: string) {
  expanded.value = expanded.value.includes(path)
    ? expanded.value.filter((item) => item !== path)
    : [...expanded.value, path]
  localStorage.setItem(storageKey.value, JSON.stringify(expanded.value))
}

function chooseFolder(path: string) {
  updateQuery({ folder: path === '/' ? undefined : path })
}

// --- pull
const pull = useRepositoryPull(currentProjectId, async () => {
  await Promise.all([folderQuery.refresh(), testQuery.refresh()])
})

watch(currentProjectId, async () => {
  await refreshSession()
  selected.value = []
  await pull.resume()
})

function relativePullTime(value: string | null | undefined): string {
  if (!value) return 'never'
  const elapsedSeconds = Math.round((Date.now() - new Date(value).valueOf()) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ]
  const [unit, size] = units.find(([, seconds]) => Math.abs(elapsedSeconds) >= seconds) ?? [
    'second',
    1,
  ]
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
    -Math.round(elapsedSeconds / size),
    unit,
  )
}

// --- selection
const selected = ref<string[]>([])
const opening = ref(false)
const openError = ref('')

function toggleSelected(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((item) => item !== id)
    : [...selected.value, id]
}

const allVisibleSelected = computed(
  () => tests.value.length > 0 && tests.value.every((test) => selected.value.includes(test.id)),
)
const selectingAll = ref(false)

interface KnownTest {
  id: string
  key: string
  folderPath: string | null
  summary?: string
  hasDraft?: boolean
}

const knownTests = new Map<string, KnownTest>()
function rememberTests(rows: KnownTest[]) {
  for (const row of rows) knownTests.set(row.id, { ...knownTests.get(row.id), ...row })
}
watch(testRows, (rows) =>
  rememberTests(
    rows.map((row) => ({
      id: row.id,
      key: row.key,
      folderPath: row.folderPath,
      summary: row.summary,
      hasDraft: row.hasDraft,
    })),
  ),
)

const { save: saveEditSelection } = useEditSelection()

function openEditAll() {
  const projectId = currentProjectId.value
  const items = selected.value
    .map((id) => knownTests.get(id))
    .filter((item): item is KnownTest => Boolean(item))
  if (!projectId || items.length === 0) return
  saveEditSelection({
    projectId,
    items: items.map((item) => ({
      id: item.id,
      key: item.key,
      summary: item.summary ?? '',
      folderPath: item.folderPath,
      hasDraft: Boolean(item.hasDraft),
    })),
  })
  void navigateTo({ path: '/tests/edit', query: { project: projectId } })
}

// Clears the selection when all visible rows are selected; otherwise selects every test matching the filter.
async function toggleAll() {
  if (allVisibleSelected.value) {
    selected.value = []
    return
  }
  selectingAll.value = true
  openError.value = ''
  try {
    const result = await $fetch<{ tests: KnownTest[]; total: number }>('/api/tests/keys', {
      query: {
        project: currentProjectId.value ?? '',
        folder: selectedFolder.value || undefined,
        q: search.value || undefined,
        includeDescendants: includeDescendants.value ? 'true' : 'false',
      },
    })
    rememberTests(result.tests)
    selected.value = result.tests.map((test) => test.id)
  } catch (error) {
    openError.value =
      error &&
      typeof error === 'object' &&
      'data' in error &&
      error.data &&
      typeof error.data === 'object' &&
      'message' in error.data &&
      typeof error.data.message === 'string'
        ? error.data.message
        : 'Selection could not be loaded. Try again.'
  } finally {
    selectingAll.value = false
  }
}

async function openInEditor() {
  if (selected.value.length !== 1) return
  const id = selected.value[0]!
  const test = tests.value.find((item) => item.id === id)
  if (!test) return
  opening.value = true
  openError.value = ''
  try {
    await $fetch('/api/tests/selection', {
      method: 'POST',
      query: { project: currentProjectId.value },
      body: { ids: [id] },
    })
    await navigateTo({
      path: `/tests/${encodeURIComponent(test.key)}`,
      query: { ...linkQuery.value, project: currentProjectId.value ?? undefined },
    })
  } catch (error) {
    openError.value =
      error &&
      typeof error === 'object' &&
      'data' in error &&
      error.data &&
      typeof error.data === 'object' &&
      'message' in error.data &&
      typeof error.data.message === 'string'
        ? error.data.message
        : 'The selected test could not be loaded from Xray. Try again.'
  } finally {
    opening.value = false
  }
}

onMounted(async () => {
  try {
    const raw = localStorage.getItem(storageKey.value)
    if (raw) expanded.value = JSON.parse(raw) as string[]
  } catch {
    expanded.value = []
  }
  await pull.resume()
})

useHead({ title: 'Repository · XrayBulk' })
</script>

<template>
  <div
    class="grid min-h-[calc(100vh-3.25rem)] max-h-[calc(100vh-3.25rem)] grid-cols-1 min-[800px]:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]"
    data-testid="repository"
    :style="{ '--sidebar-width': `${sidebarWidth}px` }"
  >
    <aside
      class="relative border-b border-default bg-elevated p-3 min-[800px]:border-b-0 min-[800px]:border-r overflow-auto max-h-[calc(100vh-3.25rem)]"
    >
      <FolderTree
        :folders="folderQuery.data.value?.folders ?? []"
        :selected-path="selectedFolder"
        :expanded-paths="expanded"
        @toggle="toggleFolder"
        @select="chooseFolder"
      />
      <button
        type="button"
        class="mx-2 mt-3 rounded-lg border border-default bg-elevated px-3 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
        :disabled="pull.pulling.value || !currentProjectId"
        data-testid="pull-from-xray"
        @click="pull.start"
      >
        ↻ Refresh all project tests
      </button>
      <div
        role="separator"
        aria-label="Resize folder sidebar"
        aria-orientation="vertical"
        :aria-valuemin="SIDEBAR_MIN_WIDTH"
        :aria-valuemax="SIDEBAR_MAX_WIDTH"
        :aria-valuenow="sidebarWidth"
        tabindex="0"
        data-testid="folder-sidebar-resizer"
        class="group absolute inset-y-0 right-0 z-10 hidden w-2 cursor-col-resize touch-none select-none min-[800px]:block"
        :class="isResizingSidebar ? 'bg-(--soft)' : ''"
        @pointerdown="onSidebarResizePointerDown"
        @pointermove="onSidebarResizePointerMove"
        @pointerup="stopSidebarResize"
        @pointercancel="stopSidebarResize"
        @lostpointercapture="stopSidebarResize"
        @keydown="onSidebarResizeKeydown"
      >
        <span
          class="pointer-events-none absolute inset-y-0 right-1 w-px bg-default group-hover:bg-primary group-focus-visible:bg-primary"
          aria-hidden="true"
        />
      </div>
    </aside>

    <div class="min-w-0 p-4 min-[800px]:px-5 overflow-auto max-h-[calc(100vh-3.25rem)]">
      <header class="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h1 class="text-lg font-semibold text-highlighted">Test repository</h1>
        <p class="text-muted">
          {{ workspace?.jiraProjectKey }} · Last pulled
          {{ relativePullTime(folderQuery.data.value?.foldersPulledAt) }}
        </p>
      </header>

      <ErrorBanner
        v-if="pull.error.value"
        class="mb-3"
        :message="`${workspace?.jiraProjectKey ?? 'Project'}: ${pull.error.value}${pull.status.value.requestId ? ` Request ID: ${pull.status.value.requestId}` : ''}`"
        data-testid="pull-error"
      />
      <p
        v-if="pull.message.value"
        role="status"
        class="mb-3 font-medium text-(--ok)"
        data-testid="pull-success"
      >
        {{ workspace?.jiraProjectKey }}: {{ pull.message.value }}
      </p>
      <p v-if="pull.pulling.value" role="status" class="mb-3" data-testid="pull-progress">
        {{ workspace?.jiraProjectKey }}: pulling {{ pull.status.value.fetched }} /
        {{ pull.status.value.total ?? '?' }} tests…
      </p>
      <ErrorBanner v-if="openError" class="mb-3" :message="openError" />
      <p v-if="route.query.notice === 'edit-no-selection'" role="status" class="mb-3">
        Select tests and choose Edit all to open the compare screen.
      </p>

      <PageCard v-if="neverPulled" data-testid="never-pulled">
        <EmptyState
          title="This repository has not been pulled yet"
          description="Refresh this project's folder and test index from Xray."
        >
          <button
            type="button"
            class="rounded-lg bg-primary px-4 py-2 font-medium text-inverted hover:opacity-90 disabled:opacity-45"
            :disabled="pull.pulling.value || !currentProjectId"
            data-testid="pull-cta"
            @click="pull.start"
          >
            Refresh all project tests
          </button>
        </EmptyState>
      </PageCard>

      <template v-else>
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <input
            :value="searchInput"
            type="search"
            class="w-full max-w-[280px] rounded-lg border border-default bg-elevated px-3 py-1.5"
            aria-label="Search tests"
            placeholder="Search key or summary…"
            @input="onSearchInput(($event.target as HTMLInputElement).value)"
          />
          <span class="text-muted" data-testid="result-count">{{ total }} tests</span>
          <span class="text-muted" data-testid="changed-count"
            >{{ displayedDraftCount }} tests changed</span
          >
          <UButton
            :disabled="displayedDraftCount === 0"
            data-testid="review-changes"
            @click="
              navigateTo({ path: '/review', query: { project: currentProjectId ?? undefined } })
            "
            >Review {{ displayedDraftCount }} changes</UButton
          >
          <UButton :disabled="selected.length === 0" data-testid="edit-all" @click="openEditAll"
            >Edit all ({{ selected.length }})</UButton
          >
          <label class="inline-flex items-center gap-2">
            <input
              type="checkbox"
              class="size-4 accent-(--brand)"
              :checked="includeDescendants"
              @change="
                updateQuery({
                  descendants: ($event.target as HTMLInputElement).checked ? 'true' : undefined,
                })
              "
            />
            Include subfolders
          </label>
        </div>

        <SelectionBar
          :count="selected.length"
          :opening="opening"
          @clear="selected = []"
          @open="openInEditor"
        />

        <LoadingSkeleton
          v-if="testQuery.status.value === 'pending' && !testQuery.data.value"
          label="Loading tests"
        />
        <ErrorBanner
          v-else-if="testQuery.error.value"
          title="Tests could not be loaded."
          message="Check your connection and try again."
          retryable
          @retry="testQuery.refresh()"
        />
        <PageCard v-else-if="total === 0">
          <EmptyState
            :title="
              search
                ? 'No tests match this search'
                : selectedFolder
                  ? 'This folder has no tests'
                  : 'No tests in this repository'
            "
            :description="search ? 'Try a different key or summary.' : undefined"
          />
        </PageCard>
        <template v-else>
          <div @keydown.capture="onGridKeydown">
            <TestList
              :tests="testRows"
              :selected-ids="selected"
              :link-query="linkQuery"
              :busy="testQuery.status.value === 'pending'"
              :draft-count="projectDraftCount"
              @toggle="toggleSelected"
              @toggle-all="toggleAll"
              @update="updateDraft"
              @revert="revertDraft"
              @retry-hydration="retryHydration"
              @retry-save="retrySave"
            />
          </div>
          <p class="mt-3 text-xs text-muted">
            Edits are saved as local drafts. Nothing is written to Xray until you review and sync.
          </p>
          <div class="mt-3 flex items-center justify-between gap-2">
            <span class="text-muted">{{ total }} tests</span>
            <div class="flex gap-2">
              <UButton
                variant="outline"
                color="neutral"
                :disabled="offset === 0"
                @click="updateQuery({ offset: Math.max(0, offset - PAGE_SIZE) })"
                >Previous</UButton
              >
              <UButton
                variant="outline"
                color="neutral"
                :disabled="
                  testQuery.data.value?.nextOffset === null ||
                  testQuery.data.value?.nextOffset === undefined
                "
                @click="updateQuery({ offset: testQuery.data.value?.nextOffset ?? offset })"
                >Next</UButton
              >
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
