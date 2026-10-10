<script setup lang="ts">
import { calculateVariableWindow, findEditableRow } from '#shared/drafts/grid-window'

export interface RepositoryTest {
  id: string
  key: string
  summary: string
  folderPath: string | null
  remoteDeletedAt: string | null
  issueId: string
  testType?: string
  gherkin?: string | null
  readOnly?: boolean
  hydrated?: boolean
  hydrationError?: string
  hasDraft?: boolean
  draftFields?: { summary: string | null } | null
  baseFields?: { summary: string; gherkin: string | null } | null
  saveState?: 'idle' | 'saving' | 'saved' | 'error'
  validationError?: string
}

const props = defineProps<{
  tests: RepositoryTest[]
  selectedIds: string[]
  linkQuery: Record<string, string>
  busy?: boolean
  draftCount?: number
}>()

const emit = defineEmits<{
  toggle: [id: string]
  toggleAll: []
  update: [payload: { id: string; field: 'summary'; value: string }]
  revert: [id: string]
  retryHydration: [id: string]
  retrySave: [id: string]
}>()

const allSelected = computed(
  () => props.tests.length > 0 && props.tests.every((test) => props.selectedIds.includes(test.id)),
)
const someSelected = computed(
  () => !allSelected.value && props.tests.some((test) => props.selectedIds.includes(test.id)),
)
const headerCheckbox = ref<HTMLInputElement>()
const viewport = ref<HTMLElement>()
const scrollTop = ref(0)
const focusedCell = ref<string | null>(null)
const originalCellValues = new Map<string, string>()
const ESTIMATED_ROW_HEIGHT = 72
const OVERSCAN = 5
const rowHeights = reactive(new Map<string, number>())
const rowHeightList = computed(() =>
  props.tests.map((test) => rowHeights.get(test.id) ?? ESTIMATED_ROW_HEIGHT),
)
const gridWindow = computed(() =>
  calculateVariableWindow(
    rowHeightList.value,
    scrollTop.value,
    viewport.value?.clientHeight ?? 864,
    OVERSCAN,
  ),
)
const visibleStart = computed(() => gridWindow.value.start)
const visibleEnd = computed(() => gridWindow.value.end)
const visibleTests = computed(() => props.tests.slice(visibleStart.value, visibleEnd.value))
const topSpacer = computed(() => gridWindow.value.topSpacer)
const bottomSpacer = computed(() => gridWindow.value.bottomSpacer)
watchEffect(() => {
  if (headerCheckbox.value) headerCheckbox.value.indeterminate = someSelected.value
})

function onScroll(event: Event) {
  scrollTop.value = (event.target as HTMLElement).scrollTop
}

function rowOffset(index: number): number {
  return rowHeightList.value.slice(0, index).reduce((sum, height) => sum + height, 0)
}

// Rows keep their rendered height so expanded previews push the rows below them down.
function measureRows() {
  if (!viewport.value) return
  for (const row of viewport.value.querySelectorAll<HTMLElement>('tr[data-testcase-id]')) {
    const id = row.dataset.testcaseId!
    const height = row.getBoundingClientRect().height
    if (height > 0 && Math.abs((rowHeights.get(id) ?? ESTIMATED_ROW_HEIGHT) - height) > 0.5) {
      rowHeights.set(id, height)
    }
  }
}

onMounted(measureRows)
onUpdated(measureRows)
function measurePreviewSoon() {
  void nextTick(measureRows)
}

function focusCell(id: string, field: string) {
  focusedCell.value = `${id}:${field}`
}

function rememberCell(event: FocusEvent, id: string, field: string) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  originalCellValues.set(`${id}:${field}`, target.value)
  focusCell(id, field)
}

function cancelCell(event: KeyboardEvent, id: string) {
  const target = event.target as HTMLInputElement
  const original = originalCellValues.get(`${id}:summary`)
  if (original !== undefined && original !== target.value) {
    target.value = original
    emit('update', { id, field: 'summary', value: original })
  }
  focusedCell.value = null
  target.blur()
}

function summaryInputFor(id: string): HTMLInputElement | null {
  return (
    viewport.value?.querySelector<HTMLInputElement>(
      `[data-testcase-id="${CSS.escape(id)}"] input[aria-label^="Summary"]`,
    ) ?? null
  )
}

async function onCellKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLInputElement
  const id = target.closest<HTMLElement>('[data-testcase-id]')?.dataset.testcaseId
  if (!id) return
  if (event.key === 'Escape') {
    cancelCell(event, id)
    return
  }
  if (event.key === 'Enter' || event.key === 'F2') {
    event.preventDefault()
    focusCell(id, 'summary')
    return
  }
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault()
  const rowIndex = props.tests.findIndex((test) => test.id === id)
  const step = event.key === 'ArrowUp' ? -1 : 1
  const editable = new Set(
    props.tests.filter((test) => test.hydrated && !test.readOnly).map((test) => test.id),
  )
  const targetIndex =
    findEditableRow(
      props.tests.map((test) => test.id),
      editable,
      rowIndex,
      step,
    ) ?? -1
  if (targetIndex < 0 || targetIndex >= props.tests.length) return
  const candidate = props.tests[targetIndex]!
  let next = summaryInputFor(candidate.id)
  if (!next && viewport.value) {
    viewport.value.scrollTop = rowOffset(targetIndex)
    await nextTick()
    next = summaryInputFor(candidate.id)
  }
  next?.focus()
}
</script>

<template>
  <div
    ref="viewport"
    class="max-h-[calc(100vh-18rem)] overflow-y-auto overflow-x-auto rounded-xl border border-default bg-elevated"
    :aria-busy="busy ? 'true' : undefined"
    :class="busy ? 'opacity-60' : ''"
    @scroll.passive="onScroll"
  >
    <table class="w-full border-collapse text-left">
      <caption class="sr-only">
        Test cases
      </caption>
      <thead>
        <tr class="border-b border-default text-xs text-muted">
          <th scope="col" class="w-8 px-3 py-2">
            <input
              ref="headerCheckbox"
              type="checkbox"
              class="size-4 align-middle accent-(--brand)"
              aria-label="Select all matching tests"
              :checked="allSelected"
              @change="emit('toggleAll')"
            />
          </th>
          <th scope="col" class="px-3 py-2 font-semibold">Key</th>
          <th scope="col" class="w-[clamp(200px,30%,380px)] px-3 py-2 font-semibold">Summary</th>
          <th scope="col" class="w-[clamp(120px,14%,200px)] px-3 py-2 font-semibold">Folder</th>
          <th scope="col" class="min-w-[320px] px-3 py-2 font-semibold">Gherkin</th>
          <th scope="col" class="w-24 px-3 py-2 font-semibold">Draft</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="topSpacer" aria-hidden="true">
          <td :colspan="6" :style="{ height: `${topSpacer}px`, padding: 0, border: 0 }" />
        </tr>
        <tr
          v-for="test in visibleTests"
          :key="test.id"
          class="border-b border-default last:border-b-0"
          :class="test.hasDraft ? 'bg-(--soft)' : ''"
          :data-testcase-id="test.id"
        >
          <td class="px-3 py-2">
            <input
              type="checkbox"
              class="size-4 align-middle accent-(--brand)"
              :aria-label="`Select ${test.key}`"
              :checked="selectedIds.includes(test.id)"
              @change="emit('toggle', test.id)"
            />
          </td>
          <td class="whitespace-nowrap px-3 py-2">
            <NuxtLink
              :to="{ path: `/tests/${encodeURIComponent(test.key)}`, query: linkQuery }"
              class="font-semibold text-primary underline-offset-2 hover:underline"
              >{{ test.hasDraft ? '• ' : '' }}{{ test.key }}</NuxtLink
            >
            <StatusBadge v-if="test.remoteDeletedAt" tone="bad" class="ml-2"
              >Remote deleted</StatusBadge
            >
          </td>
          <td class="px-3 py-2">
            <CellTooltip
              v-if="test.hydrated && !test.readOnly"
              :text="test.summary"
              :test-id="test.id"
            >
              <input
                :value="test.summary"
                :aria-label="`Summary for ${test.key}`"
                :class="
                  test.draftFields?.summary !== null && test.draftFields?.summary !== undefined
                    ? 'bg-(--soft) ring-1 ring-primary'
                    : ''
                "
                :aria-invalid="test.validationError ? 'true' : undefined"
                class="w-full truncate rounded border border-transparent bg-transparent px-2 py-1 focus:border-primary focus:outline-none"
                @focus="rememberCell($event, test.id, 'summary')"
                @blur="focusedCell = null"
                @input="
                  emit('update', {
                    id: test.id,
                    field: 'summary',
                    value: ($event.target as HTMLInputElement).value,
                  })
                "
                @keydown="onCellKeydown"
              />
            </CellTooltip>
            <span
              v-else-if="!test.hydrated && !test.hydrationError"
              role="status"
              class="text-muted"
              >Loading details…</span
            >
            <span v-else>{{ test.summary }}</span>
            <p v-if="test.validationError" class="text-xs text-error">{{ test.validationError }}</p>
          </td>
          <td class="px-3 py-2">
            <FolderPathCell :path="test.folderPath" :test-id="test.id" />
          </td>
          <td class="min-w-[320px] px-3 py-2">
            <details v-if="test.gherkin" class="text-xs" @toggle="measurePreviewSoon">
              <summary class="cursor-pointer text-primary">Preview</summary>
              <pre class="whitespace-pre-wrap break-words">{{ test.gherkin }}</pre>
            </details>
            <button
              v-if="test.hydrationError"
              type="button"
              class="text-primary underline"
              @click="emit('retryHydration', test.id)"
            >
              Retry details
            </button>
            <span v-if="test.hydrationError" role="alert" class="text-xs text-error">{{
              test.hydrationError
            }}</span>
          </td>
          <td class="whitespace-nowrap px-3 py-2 text-xs">
            <span v-if="test.saveState === 'saving'" role="status">Saving…</span>
            <span v-else-if="test.saveState === 'saved'" role="status">Saved</span>
            <template v-else-if="test.saveState === 'error'"
              ><span role="alert">Save failed</span>
              <button type="button" class="underline" @click="emit('retrySave', test.id)">
                Retry
              </button></template
            >
            <template v-if="test.hasDraft"
              ><span v-if="test.testType && test.readOnly">Read-only</span
              ><button
                type="button"
                class="ml-2 text-primary underline"
                @click="emit('revert', test.id)"
              >
                Revert
              </button></template
            >
            <span v-else-if="test.readOnly">Read-only</span>
          </td>
        </tr>
        <tr v-if="bottomSpacer" aria-hidden="true">
          <td :colspan="6" :style="{ height: `${bottomSpacer}px`, padding: 0, border: 0 }" />
        </tr>
      </tbody>
    </table>
  </div>
</template>
