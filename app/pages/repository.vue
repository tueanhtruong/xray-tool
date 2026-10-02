<script setup lang="ts">
import type { FolderNode } from '~/components/FolderTree.vue'
import type { RepositoryTest } from '~/components/TestList.vue'

interface Page {
  values: RepositoryTest[]
  total: number
  limit: number
  offset: number
  nextOffset: number | null
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

function toggleAll() {
  const visible = tests.value.map((test) => test.id)
  const all = visible.length > 0 && visible.every((id) => selected.value.includes(id))
  selected.value = all
    ? selected.value.filter((id) => !visible.includes(id))
    : [...new Set([...selected.value, ...visible])]
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
          <TestList
            :tests="tests"
            :selected-ids="selected"
            :link-query="linkQuery"
            :busy="testQuery.status.value === 'pending'"
            @toggle="toggleSelected"
            @toggle-all="toggleAll"
          />
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
