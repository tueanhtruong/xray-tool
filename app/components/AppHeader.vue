<script setup lang="ts">
const { signedIn, workspace, signOut } = useWorkspaceSession()
const route = useRoute()
const router = useRouter()
const colorMode = useColorMode()
const menuOpen = ref(false)
const menu = ref<HTMLElement>()
const projectSearch = ref('')
const projectStartAt = ref(0)
const projectPage = ref<{
  values: Array<{ id: string; key: string; name: string }>
  total: number
  maxResults: number
  isLast: boolean
} | null>(null)
const projectSearchBusy = ref(false)
const projectError = ref('')
const projectPickerOpen = ref(false)
const activeProjectResult = ref(0)
const folderRefreshing = ref(false)
const folderRefreshMessage = ref('')
const folderRefreshError = ref('')
const switchPending = ref<{
  sourceId: string
  sourceKey: string
  destinationId: string
  count: number
} | null>(null)
const selectedProject = computed(() => {
  const id =
    typeof route.query.project === 'string'
      ? route.query.project
      : workspace.value?.currentProjectId
  return workspace.value?.projects.find((project) => project.id === id) ?? null
})
const draftCount = useState<number>('project-draft-count', () => 0)
watch(() => selectedProject.value?.id, async (id) => {
  if (!id || !signedIn.value) { draftCount.value = 0; return }
  try {
    const result = await $fetch<{ count: number }>(`/api/projects/${encodeURIComponent(id)}/drafts`)
    draftCount.value = result.count
  } catch { draftCount.value = 0 }
}, { immediate: true })

async function searchProjects(startAt = 0) {
  projectSearchBusy.value = true
  projectError.value = ''
  projectStartAt.value = startAt
  try {
    projectPage.value = await $fetch('/api/jira/projects', {
      query: { query: projectSearch.value, startAt, maxResults: 20 },
    })
    activeProjectResult.value = 0
  } catch {
    projectError.value =
      'Jira projects could not be loaded. Check the Jira connection and try again.'
  } finally {
    projectSearchBusy.value = false
  }
}

let projectSearchTimer: ReturnType<typeof setTimeout> | undefined
watch(projectSearch, () => {
  if (projectSearchTimer) clearTimeout(projectSearchTimer)
  projectSearchTimer = setTimeout(() => void searchProjects(0), 250)
})
onBeforeUnmount(() => {
  if (projectSearchTimer) clearTimeout(projectSearchTimer)
})

async function chooseProject(project: { id: string; key: string; name: string }) {
  projectError.value = ''
  try {
    let destinationProjectId = workspace.value?.projects.find(
      (candidate) => candidate.jiraProjectId === project.id,
    )?.id
    const currentProjects = workspace.value?.projects ?? []
    if (!currentProjects.some((candidate) => candidate.jiraProjectId === project.id)) {
      const verified = await $fetch<{ projectId: string }>('/api/project', {
        method: 'PUT',
        body: { projectId: project.id },
      })
      destinationProjectId = verified.projectId
      await refreshNuxtData('workspace-session')
    }
    if (!destinationProjectId) throw new Error('The verified project could not be loaded.')
    await switchToProject(destinationProjectId)
    projectPickerOpen.value = false
  } catch (error) {
    projectError.value =
      error &&
      typeof error === 'object' &&
      'data' in error &&
      error.data &&
      typeof error.data === 'object' &&
      'message' in error.data &&
      typeof error.data.message === 'string'
        ? error.data.message
        : 'Project access could not be verified. Try again.'
  }
}

async function switchToProject(projectId: string) {
  if (selectedProject.value && selectedProject.value.id !== projectId) {
    const draftData = await $fetch<{ count: number }>(
      `/api/projects/${encodeURIComponent(selectedProject.value.id)}/drafts`,
    )
    if (draftData.count > 0) {
      switchPending.value = {
        sourceId: selectedProject.value.id,
        sourceKey: selectedProject.value.jiraProjectKey,
        destinationId: projectId,
        count: draftData.count,
      }
      projectPickerOpen.value = false
      return
    }
  }
  changeProject(projectId)
}

function cancelProjectSwitch() {
  switchPending.value = null
}

function keepDraftsAndSwitch() {
  if (!switchPending.value) return
  const destinationId = switchPending.value.destinationId
  switchPending.value = null
  changeProject(destinationId)
}

async function reviewDrafts() {
  if (!switchPending.value) return
  const sourceId = switchPending.value.sourceId
  switchPending.value = null
  await navigateTo(`/projects/${encodeURIComponent(sourceId)}/drafts`)
}

function changeProject(projectId: string) {
  const query = { ...route.query, project: projectId }
  void router.push({ path: route.path.startsWith('/tests/') ? '/repository' : route.path, query })
}

async function refreshFolders() {
  if (!selectedProject.value) return
  folderRefreshing.value = true
  folderRefreshMessage.value = ''
  folderRefreshError.value = ''
  try {
    await $fetch('/api/pull/folders', {
      method: 'POST',
      query: { project: selectedProject.value.id },
    })
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const status = await $fetch<{ state: string; message?: string }>('/api/pull/status', {
        query: { project: selectedProject.value.id },
      })
      if (status.state === 'succeeded') {
        folderRefreshMessage.value = `${selectedProject.value.jiraProjectKey}: ${status.message ?? 'Folders refreshed.'}`
        await refreshNuxtData()
        return
      }
      if (status.state === 'failed') throw new Error(status.message ?? 'Folder refresh failed.')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(
      'Folder refresh is taking longer than expected. Check project status and try again.',
    )
  } catch (error) {
    folderRefreshError.value =
      error &&
      typeof error === 'object' &&
      'data' in error &&
      error.data &&
      typeof error.data === 'object' &&
      'message' in error.data &&
      typeof error.data.message === 'string'
        ? error.data.message
        : error instanceof Error
          ? error.message
          : 'Folders could not be refreshed.'
  } finally {
    folderRefreshing.value = false
  }
}

function onProjectSearchKeydown(event: KeyboardEvent) {
  const values = projectPage.value?.values ?? []
  if (event.key === 'ArrowDown' && values.length) {
    event.preventDefault()
    activeProjectResult.value = Math.min(values.length - 1, activeProjectResult.value + 1)
  } else if (event.key === 'ArrowUp' && values.length) {
    event.preventDefault()
    activeProjectResult.value = Math.max(0, activeProjectResult.value - 1)
  } else if (event.key === 'Enter' && values[activeProjectResult.value]) {
    event.preventDefault()
    void chooseProject(values[activeProjectResult.value]!)
  } else if (event.key === 'Escape') {
    projectPickerOpen.value = false
  }
}

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

function closeOnOutside(event: MouseEvent) {
  if (menu.value && !menu.value.contains(event.target as Node)) menuOpen.value = false
}

onMounted(() => document.addEventListener('click', closeOnOutside))
onBeforeUnmount(() => document.removeEventListener('click', closeOnOutside))
</script>

<template>
  <header
    class="sticky z-10 border-b border-default bg-elevated h-[3.25rem]"
    style="top: env(safe-area-inset-top, 0px)"
  >
    <div class="flex flex-wrap items-center gap-3 px-5 py-2.5">
      <NuxtLink to="/" class="text-base font-bold text-highlighted" data-testid="app-name"
        >Xray<span class="text-primary">Bulk</span></NuxtLink
      >
      <nav
        v-if="signedIn && selectedProject"
        aria-label="Breadcrumb"
        class="flex items-center gap-2 text-muted"
        data-testid="header-project"
      >
        <span v-if="selectedProject.jiraProjectName"> {{ selectedProject.jiraProjectName }}</span>
        <template v-if="selectedProject">
          <span aria-hidden="true">›</span>
          <NuxtLink
            :to="{ path: '/repository', query: { project: selectedProject.id } }"
            class="hover:text-highlighted"
            >Repository</NuxtLink
          >
        </template>
      </nav>
      <UPopover
        v-if="signedIn && workspace?.jiraConnected && workspace?.xrayConnected"
        v-model:open="projectPickerOpen"
        :content="{ align: 'start', side: 'bottom', sideOffset: 8 }"
        :ui="{ content: 'w-80 rounded-sm border border-default bg-elevated p-3 shadow-lg' }"
      >
        <template #default>
          <UButton
            variant="outline"
            color="neutral"
            aria-label="Choose Jira project"
            aria-haspopup="listbox"
          >
            {{ selectedProject ? `${selectedProject.jiraProjectKey} ▾` : 'Choose project' }}
          </UButton>
        </template>
        <template #content>
          <label class="sr-only" for="header-project-search">Search Jira projects</label>
          <input
            id="header-project-search"
            v-model="projectSearch"
            role="combobox"
            aria-autocomplete="list"
            :aria-expanded="Boolean(projectPage)"
            aria-controls="header-project-results"
            :aria-activedescendant="
              projectPage?.values[activeProjectResult]
                ? `header-project-${projectPage.values[activeProjectResult]!.id}`
                : undefined
            "
            class="w-full rounded-sm border border-default bg-elevated px-2 py-1"
            placeholder="Search projects"
            @keydown="onProjectSearchKeydown"
          />
          <p v-if="projectSearchBusy" role="status" class="mt-2 text-sm text-muted">Searching…</p>
          <ErrorBanner v-if="projectError" class="mt-2" :message="projectError" />
          <p
            v-if="!projectSearchBusy && projectPage?.values.length === 0"
            class="mt-2 text-sm text-muted"
          >
            No projects found.
          </p>
          <ul
            v-if="projectPage"
            id="header-project-results"
            role="listbox"
            aria-label="Jira project results"
            class="my-3 max-h-56 overflow-auto"
          >
            <li
              v-for="(project, index) in projectPage.values"
              :id="`header-project-${project.id}`"
              :key="project.id"
              role="option"
              :aria-selected="index === activeProjectResult"
            >
              <button
                type="button"
                class="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                @mouseenter="activeProjectResult = index"
                @click="chooseProject(project)"
              >
                {{ project.key }} — {{ project.name }}
              </button>
            </li>
          </ul>
          <div
            v-if="projectPage && projectPage.total > projectPage.maxResults"
            class="mt-2 flex justify-between"
          >
            <UButton
              size="md"
              variant="ghost"
              :disabled="projectStartAt === 0 || projectSearchBusy"
              @click="searchProjects(Math.max(0, projectStartAt - projectPage!.maxResults))"
              >Previous</UButton
            >
            <UButton
              size="md"
              variant="ghost"
              :disabled="projectPage.isLast || projectSearchBusy"
              @click="searchProjects(projectStartAt + projectPage!.maxResults)"
              >Next</UButton
            >
          </div>
        </template>
      </UPopover>
      <UButton
        v-if="selectedProject"
        variant="ghost"
        color="neutral"
        aria-label="Refresh folders"
        :disabled="folderRefreshing"
        @click="refreshFolders"
        >{{ folderRefreshing ? 'Refreshing folders…' : 'Refresh folders' }}</UButton
      >
      <span v-if="folderRefreshMessage" role="status" class="text-xs text-(--ok)">{{
        folderRefreshMessage
      }}</span>
      <ErrorBanner
        v-if="folderRefreshError"
        :message="folderRefreshError"
        class="max-w-xs text-xs"
      />
      <div
        v-if="switchPending"
        role="dialog"
        aria-modal="true"
        aria-labelledby="draft-switch-title"
        class="absolute left-1/2 top-full z-30 mt-2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-default bg-elevated p-4 shadow-xl"
      >
        <h2 id="draft-switch-title" class="font-semibold">
          Unsynced drafts in {{ switchPending.sourceKey }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ switchPending.count }} draft(s) will stay private to you. Switching will not sync or
          discard them.
        </p>
        <div class="mt-4 flex flex-wrap justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="cancelProjectSwitch">Cancel</UButton>
          <UButton variant="outline" color="neutral" @click="reviewDrafts">Review drafts</UButton>
          <UButton @click="keepDraftsAndSwitch">Switch and keep drafts</UButton>
        </div>
      </div>
      <span v-if="signedIn && selectedProject" class="rounded-full border border-default px-2 py-1 text-xs" data-testid="draft-count-chip">
        {{ draftCount }} drafts
      </span>
      <div class="ml-auto flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-default px-2.5 py-1 text-sm hover:bg-muted"
          aria-label="Toggle theme"
          data-testid="theme-toggle"
          @click="toggleTheme"
        >
          <ClientOnly>
            <span aria-hidden="true">{{ colorMode.value === 'dark' ? '☀' : '☾' }}</span>
            <template #fallback><span aria-hidden="true">☾</span></template>
          </ClientOnly>
        </button>
        <div v-if="signedIn" ref="menu" class="relative">
          <button
            type="button"
            class="rounded-lg border border-default px-3 py-1 text-sm hover:bg-muted"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            data-testid="user-menu"
            @click="menuOpen = !menuOpen"
            @keydown.escape="menuOpen = false"
          >
            Account
          </button>
          <div
            v-if="menuOpen"
            role="menu"
            class="absolute right-0 mt-1 min-w-40 rounded-lg border border-default bg-elevated p-1 shadow-md"
            @keydown.escape="menuOpen = false"
          >
            <NuxtLink
              to="/settings"
              role="menuitem"
              class="block rounded-md px-3 py-1.5 text-sm hover:bg-muted"
              @click="menuOpen = false"
              >Settings</NuxtLink
            >
            <button
              type="button"
              role="menuitem"
              class="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted"
              data-testid="logout"
              @click="signOut"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
