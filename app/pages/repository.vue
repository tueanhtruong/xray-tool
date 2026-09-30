<script setup lang="ts">
interface Folder { path: string; name: string; parentPath: string | null; remoteTestsCount: number; folders: Folder[] }
interface RepositoryTest {
  id: string
  key: string
  summary: string
  folderPath: string | null
  remoteDeletedAt: string | null
  issueId: string
}
interface RepositoryDetail extends RepositoryTest {
  labels: string[]
  status: string
  testType: string
  gherkin: string | null
  readOnly: boolean
}
interface Page { values: RepositoryTest[]; total: number; limit: number; offset: number; nextOffset: number | null }

const route = useRoute()
const router = useRouter()
const { data: session } = await useFetch<{ workspace: { id: string; siteUrl: string; jiraProjectKey: string | null } }>('/api/auth/session')
const selectedFolder = computed(() => typeof route.query.folder === 'string' ? route.query.folder : '')
const search = computed(() => typeof route.query.q === 'string' ? route.query.q : '')
const includeDescendants = computed(() => route.query.descendants === 'true')
const offset = computed(() => Number(route.query.offset ?? 0) || 0)
const folderQuery = await useFetch<{ folders: Folder[]; foldersPulledAt: string | null }>('/api/folders')
const filters = computed(() => ({
  folder: selectedFolder.value || undefined,
  q: search.value || undefined,
  includeDescendants: includeDescendants.value ? 'true' : 'false',
  offset: String(offset.value),
  limit: '50',
}))
const testQuery = await useFetch<Page>('/api/tests', { query: filters, watch: [filters] })
const selected = ref<string[]>([])
const detail = ref<RepositoryDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const selecting = ref(false)
const pullError = ref('')
const pullMessage = ref('')
const pulling = ref(false)
const pullStatus = ref<{ state: string; fetched: number; total: number | null; folders: number | null; message?: string; requestId?: string }>({ state: 'idle', fetched: 0, total: null, folders: null })
let poll: ReturnType<typeof setInterval> | undefined
const expanded = ref<string[]>([])

function updateQuery(patch: Record<string, string | number | boolean | undefined>) {
  const entries = Object.entries({ ...route.query, ...patch, offset: undefined })
    .filter(([, value]) => value !== undefined && value !== '')
  void router.push({ query: Object.fromEntries(entries) })
}

function toggleFolder(path: string) {
  expanded.value = expanded.value.includes(path)
    ? expanded.value.filter((item) => item !== path)
    : [...expanded.value, path]
  if (session.value?.workspace.id) localStorage.setItem(`repository-folders:${session.value.workspace.id}`, JSON.stringify(expanded.value))
}

function chooseFolder(path: string) {
  updateQuery({ folder: path === '/' ? undefined : path })
}

async function refreshStatus() {
  pullStatus.value = await $fetch<{ state: string; fetched: number; total: number | null; folders: number | null; message?: string; requestId?: string }>('/api/pull/status')
}

function relativePullTime(value: string | null | undefined): string {
  if (!value) return 'never'
  const elapsedSeconds = Math.round((Date.now() - new Date(value).valueOf()) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400],
    ['hour', 3_600], ['minute', 60], ['second', 1],
  ]
  const [unit, size] = units.find(([, seconds]) => Math.abs(elapsedSeconds) >= seconds) ?? ['second', 1]
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-Math.round(elapsedSeconds / size), unit)
}

async function startPull() {
  pullError.value = ''
  pullMessage.value = ''
  pulling.value = true
  try {
    await $fetch('/api/pull', { method: 'POST' })
    await refreshStatus()
    poll = setInterval(async () => {
      await refreshStatus()
      if (pullStatus.value.state !== 'running') {
        if (poll) clearInterval(poll)
        poll = undefined
        pulling.value = false
        if (pullStatus.value.state === 'succeeded') {
          pullMessage.value = pullStatus.value.message ?? 'Pull completed.'
          await Promise.all([folderQuery.refresh(), testQuery.refresh()])
        } else if (pullStatus.value.state === 'failed') pullError.value = pullStatus.value.message ?? 'Pull failed.'
      }
    }, 500)
  } catch (error) {
    pulling.value = false
    pullError.value = error && typeof error === 'object' && 'data' in error && error.data &&
      typeof error.data === 'object' && 'message' in error.data && typeof error.data.message === 'string'
      ? error.data.message
      : 'Pull could not be started. Try again.'
  }
}

function toggleSelected(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter((item) => item !== id) : [...selected.value, id]
}

async function openTest(testCase: RepositoryTest) {
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  try {
    detail.value = await $fetch<RepositoryDetail>(`/api/tests/${encodeURIComponent(testCase.id)}`)
  } catch {
    detailError.value = 'Test details could not be loaded from Xray. Try again.'
  } finally {
    detailLoading.value = false
  }
}

async function openSelected() {
  selecting.value = true
  pullError.value = ''
  try {
    await $fetch('/api/tests/selection', { method: 'POST', body: { ids: selected.value } })
    await navigateTo({ path: '/editor', query: { ids: selected.value.join(',') } })
  } catch (error) {
    pullError.value = error && typeof error === 'object' && 'data' in error && error.data &&
      typeof error.data === 'object' && 'message' in error.data && typeof error.data.message === 'string'
      ? error.data.message
      : 'Selected tests could not be loaded from Xray. Try again.'
  } finally {
    selecting.value = false
  }
}

function jiraIssueUrl(key: string) {
  const siteUrl = session.value?.workspace.siteUrl
  return siteUrl ? `${siteUrl.replace(/\/$/, '')}/browse/${encodeURIComponent(key)}` : '#'
}

onMounted(async () => {
  try {
    const raw = localStorage.getItem(`repository-folders:${session.value?.workspace.id}`)
    if (raw) expanded.value = JSON.parse(raw) as string[]
  } catch {
    expanded.value = []
  }
  await refreshStatus()
})
onBeforeUnmount(() => { if (poll) clearInterval(poll) })
useHead({ title: 'Test Repository' })
</script>

<template>
  <UContainer class="py-8" data-testid="repository">
    <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-3xl font-semibold">Test Repository</h1>
        <p class="text-muted">{{ session?.workspace.jiraProjectKey }} · Last pulled {{ relativePullTime(folderQuery.data.value?.foldersPulledAt) }}</p>
      </div>
      <UButton color="neutral" variant="outline" :loading="pulling" data-testid="pull-from-xray" @click="startPull">Pull from Xray</UButton>
    </header>
    <p v-if="pullError" role="alert" class="mb-3 border-2 border-red-800 bg-red-50 p-3 font-medium text-red-950" data-testid="pull-error">{{ pullError }}<span v-if="pullStatus.requestId"> Request ID: {{ pullStatus.requestId }}</span></p>
    <p v-if="pullMessage" role="status" class="mb-3 border-2 border-green-800 bg-green-50 p-3 font-medium text-green-950" data-testid="pull-success">{{ pullMessage }}</p>
    <p v-if="pulling" role="status" data-testid="pull-progress">Pulling {{ pullStatus.fetched }} / {{ pullStatus.total ?? '?' }} tests…</p>
    <p v-if="!folderQuery.data.value?.foldersPulledAt" class="my-4" data-testid="never-pulled">Pull from Xray to load this repository.</p>
    <div class="grid gap-6 lg:grid-cols-[minmax(16rem,1fr)_3fr]">
      <nav aria-label="Test folders" class="rounded border p-3">
        <button class="block w-full rounded px-2 py-1 text-left" :aria-current="!selectedFolder ? 'page' : undefined" @click="chooseFolder('/')">All folders</button>
        <ul>
          <RepositoryFolderNode
            v-for="folder in folderQuery.data.value?.folders ?? []"
            :key="folder.path"
            :folder="folder"
            :selected-path="selectedFolder"
            :expanded-paths="expanded"
            @toggle="toggleFolder"
            @select="chooseFolder"
          />
        </ul>
      </nav>
      <section aria-label="Test cases" class="min-w-0">
        <div class="mb-3 grid gap-2 md:grid-cols-4">
          <UInput :model-value="search" aria-label="Search tests" placeholder="Search key or name" @update:model-value="(value) => updateQuery({ q: String(value) })" />
        </div>
        <label class="mb-3 inline-flex items-center gap-2"><input type="checkbox" :checked="includeDescendants" @change="(event) => updateQuery({ descendants: (event.target as HTMLInputElement).checked ? 'true' : undefined })"> Include subfolders</label>
        <p v-if="testQuery.data.value?.total === 0 && !selectedFolder && !search" class="mb-3">No tests in this repository.</p>
        <p v-if="testQuery.data.value?.total === 0 && (selectedFolder || search)" class="mb-3">No tests match this selection.</p>
        <p v-if="testQuery.error.value" role="alert" class="border-2 border-red-800 bg-red-50 p-3 font-medium text-red-950">Tests could not be loaded.</p>
        <div class="overflow-x-auto rounded border">
          <table class="w-full text-left">
            <thead><tr><th class="p-2">Select</th><th class="p-2">Key</th><th class="p-2">Name</th><th class="p-2">Folder</th></tr></thead>
            <tbody>
              <tr v-for="testCase in testQuery.data.value?.values ?? []" :key="testCase.id" class="border-t">
                <td class="p-2"><input type="checkbox" :aria-label="`Select ${testCase.key}`" :checked="selected.includes(testCase.id)" @change="toggleSelected(testCase.id)"></td>
                <td class="p-2"><button class="underline" @click="openTest(testCase)">{{ testCase.key }}</button><span v-if="testCase.remoteDeletedAt" class="ml-1 font-semibold text-[#b91c1c]">Remote deleted</span></td>
                <td class="p-2">{{ testCase.summary }}</td>
                <td class="p-2">{{ testCase.folderPath ?? '/' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mt-3 flex items-center justify-between">
          <span>{{ testQuery.data.value?.total ?? 0 }} tests</span>
          <div class="flex gap-2"><UButton variant="outline" :disabled="offset === 0" @click="updateQuery({ offset: Math.max(0, offset - 50) })">Previous</UButton><UButton variant="outline" :disabled="testQuery.data.value?.nextOffset === null || testQuery.data.value?.nextOffset === undefined" @click="updateQuery({ offset: testQuery.data.value?.nextOffset ?? offset })">Next</UButton></div>
        </div>
        <UButton v-if="selected.length" class="mt-3" :loading="selecting" data-testid="open-selected" @click="openSelected">Open {{ selected.length }} selected in editor</UButton>
      </section>
    </div>
    <UModal :open="Boolean(detail || detailLoading || detailError)" @update:open="(open) => { if (!open) { detail = null; detailError = '' } }">
      <template #content>
        <section v-if="detailLoading" class="space-y-3 p-6" aria-label="Test details" role="status">Loading current Xray details…</section>
        <section v-else-if="detailError" class="space-y-3 p-6" aria-label="Test details" role="alert">{{ detailError }}</section>
        <section v-else-if="detail" class="space-y-3 p-6" aria-label="Test details">
          <h2 class="text-xl font-semibold">{{ detail.key }} · {{ detail.summary }}</h2>
          <p>Labels: {{ detail.labels.join(', ') || 'None' }}</p><p>Status: {{ detail.status }}</p>
          <p v-if="detail.readOnly" class="text-muted">Read-only {{ detail.testType }} test</p>
          <GherkinCode :source="detail.gherkin ?? 'No Gherkin definition'" />
          <a :href="jiraIssueUrl(detail.key)" target="_blank" rel="noopener noreferrer">Open in Jira</a>
          <UButton variant="outline" @click="detail = null">Close</UButton>
        </section>
      </template>
    </UModal>
  </UContainer>
</template>
