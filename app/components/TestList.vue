<script setup lang="ts">
import { calculateGridWindow, findEditableRow } from '#shared/drafts/grid-window'

export interface RepositoryTest {
  id: string
  key: string
  summary: string
  folderPath: string | null
  remoteDeletedAt: string | null
  issueId: string
  labels?: string[]
  status?: string
  testType?: string
  gherkin?: string | null
  readOnly?: boolean
  hydrated?: boolean
  hydrationError?: string
  hasDraft?: boolean
  draftFields?: { summary: string | null; labels: string[] | null; status: string | null } | null
  baseFields?: { summary: string | null; labels: string[]; status: string | null } | null
  saveState?: 'idle' | 'saving' | 'saved' | 'error'
  validationError?: string
}

const props = defineProps<{
  tests: RepositoryTest[]
  selectedIds: string[]
  linkQuery: Record<string, string>
  busy?: boolean
  statuses?: string[]
  draftCount?: number
}>()

const emit = defineEmits<{
  toggle: [id: string]
  toggleAll: []
  update: [payload: { id: string; field: 'summary' | 'labels' | 'status'; value: string | string[] }]
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
const ROW_HEIGHT = 72
const OVERSCAN = 5
const viewportRows = computed(() => Math.max(1, Math.ceil((viewport.value?.clientHeight ?? 864) / ROW_HEIGHT)))
const gridWindow = computed(() => calculateGridWindow(props.tests.length, scrollTop.value, ROW_HEIGHT, viewportRows.value, OVERSCAN))
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

function focusCell(id: string, field: string) { focusedCell.value = `${id}:${field}` }

function rememberCell(event: FocusEvent, id: string, field: string) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  originalCellValues.set(`${id}:${field}`, target.value)
  focusCell(id, field)
}

function cancelCell(event: KeyboardEvent, id: string, field: 'summary' | 'labels' | 'status') {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  const key = `${id}:${field}`
  const original = originalCellValues.get(key)
  if (original !== undefined && original !== target.value) {
    target.value = original
    emit('update', {
      id,
      field,
      value: field === 'labels'
        ? original.split(',').map((label) => label.trim()).filter(Boolean)
        : original,
    })
  }
  focusedCell.value = null
  target.blur()
}

async function onCellKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    const target = event.target as HTMLElement
    const id = target.closest<HTMLElement>('[data-testcase-id]')?.dataset.testcaseId
    const aria = target.getAttribute('aria-label') ?? ''
    if (id) cancelCell(event, id, aria.startsWith('Summary') ? 'summary' : aria.startsWith('Labels') ? 'labels' : 'status')
    else target.blur()
    return
  }
  if (event.key === 'Enter' || event.key === 'F2') {
    event.preventDefault()
    const target = event.target as HTMLElement
    const rowId = target.closest<HTMLElement>('[data-testcase-id]')?.dataset.testcaseId
    const aria = target.getAttribute('aria-label') ?? ''
    if (rowId) focusCell(rowId, aria.startsWith('Summary') ? 'summary' : aria.startsWith('Labels') ? 'labels' : 'status')
    return
  }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  const currentElement = event.target as HTMLElement
  const row = currentElement.closest<HTMLElement>('[data-testcase-id]')
  const id = row?.dataset.testcaseId
  if (!id) return
  const rowIndex = props.tests.findIndex((test) => test.id === id)
  const field = currentElement.getAttribute('aria-label')?.startsWith('Summary')
    ? 'summary'
    : currentElement.getAttribute('aria-label')?.startsWith('Labels')
      ? 'labels'
      : 'status'
  const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  let targetIndex = rowIndex + step
  let target = step === 0
    ? currentElement.parentElement?.querySelector<HTMLElement>(event.key === 'ArrowLeft' ? 'input, select' : 'input, select')
    : undefined
  if (step === 0) {
    const rowControls = [...(row?.querySelectorAll<HTMLElement>('input:not([type=checkbox]), select') ?? [])]
    const fieldIndex = rowControls.indexOf(currentElement)
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    target = rowControls[fieldIndex + direction]
    if (!target) {
      targetIndex = rowIndex + direction
      while (targetIndex >= 0 && targetIndex < props.tests.length) {
        const candidateRow = props.tests[targetIndex]!
        const candidate = viewport.value?.querySelector<HTMLElement>(`[data-testcase-id="${CSS.escape(candidateRow.id)}"]`)
        const candidateControls = [...(candidate?.querySelectorAll<HTMLElement>('input:not([type=checkbox]), select') ?? [])]
        target = direction < 0 ? candidateControls[candidateControls.length - 1] : candidateControls[0]
        if (target) break
        targetIndex += direction
      }
    }
  } else {
    const editable = new Set(props.tests.filter((test) => test.hydrated && !test.readOnly).map((test) => test.id))
    targetIndex = findEditableRow(props.tests.map((test) => test.id), editable, rowIndex, step) ?? -1
    if (targetIndex >= 0 && targetIndex < props.tests.length) {
      const candidate = props.tests[targetIndex]!
      target = viewport.value?.querySelector<HTMLElement>(`[data-testcase-id="${CSS.escape(candidate.id)}"] [aria-label^="${field === 'summary' ? 'Summary' : field === 'labels' ? 'Labels' : 'Status'}"]`)
    }
  }
  if (!target && targetIndex >= 0 && targetIndex < props.tests.length && viewport.value) {
    event.preventDefault()
    viewport.value.scrollTop = targetIndex * ROW_HEIGHT
    await nextTick()
    const candidate = props.tests[targetIndex]!
    target = viewport.value.querySelector<HTMLElement>(`[data-testcase-id="${CSS.escape(candidate.id)}"] [aria-label^="${field === 'summary' ? 'Summary' : field === 'labels' ? 'Labels' : 'Status'}"]`)
  }
  event.preventDefault()
  target?.focus()
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
    <table class="w-full min-w-[1100px] border-collapse text-left">
      <caption class="sr-only">Test cases</caption>
      <thead>
        <tr class="border-b border-default text-xs text-muted">
          <th scope="col" class="w-8 px-3 py-2">
            <input
              ref="headerCheckbox"
              type="checkbox"
              class="size-4 align-middle accent-(--brand)"
              aria-label="Select all visible tests"
              :checked="allSelected"
              @change="emit('toggleAll')"
            />
          </th>
          <th scope="col" class="px-3 py-2 font-semibold">Key</th>
          <th scope="col" class="px-3 py-2 font-semibold">Summary</th>
          <th scope="col" class="px-3 py-2 font-semibold">Labels</th>
          <th scope="col" class="px-3 py-2 font-semibold">Status</th>
          <th scope="col" class="px-3 py-2 font-semibold">Folder</th>
          <th scope="col" class="px-3 py-2 font-semibold">Gherkin</th>
          <th scope="col" class="px-3 py-2 font-semibold">Draft</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="topSpacer" aria-hidden="true"><td :colspan="8" :style="{ height: `${topSpacer}px`, padding: 0, border: 0 }" /></tr>
        <tr v-for="test in visibleTests" :key="test.id" class="h-[72px] border-b border-default last:border-b-0" :class="test.hasDraft ? 'bg-(--soft)' : ''" :data-testcase-id="test.id">
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
            <StatusBadge v-if="test.remoteDeletedAt" tone="bad" class="ml-2">Remote deleted</StatusBadge>
          </td>
          <td class="px-3 py-2">
            <input
              v-if="test.hydrated && !test.readOnly"
              :value="test.summary"
              :aria-label="`Summary for ${test.key}`"
              :class="test.draftFields?.summary !== null && test.draftFields?.summary !== undefined ? 'bg-(--soft) ring-1 ring-primary' : ''"
              :aria-invalid="test.validationError ? 'true' : undefined"
              class="w-full rounded border border-transparent bg-transparent px-2 py-1 focus:border-primary focus:outline-none"
              @focus="rememberCell($event, test.id, 'summary')"
              @blur="focusedCell = null"
              @input="emit('update', { id: test.id, field: 'summary', value: ($event.target as HTMLInputElement).value })"
              @keydown="onCellKeydown"
            />
            <span v-else-if="!test.hydrated && !test.hydrationError" role="status" class="text-muted">Loading details…</span>
            <span v-else>{{ test.summary }}</span>
            <p v-if="test.validationError" class="text-xs text-error">{{ test.validationError }}</p>
          </td>
          <td class="px-3 py-2">
            <template v-if="test.hydrated && !test.readOnly">
              <div class="flex flex-wrap gap-1">
                <AppChip v-for="label in test.labels ?? []" :key="label">{{ label }}</AppChip>
              </div>
              <input
                :value="(test.labels ?? []).join(', ')"
                :aria-label="`Labels for ${test.key}; comma separated`"
                :aria-invalid="test.validationError ? 'true' : undefined"
                placeholder="Add labels, comma separated"
                class="mt-1 w-full rounded border border-transparent bg-transparent px-2 py-1 text-xs focus:border-primary focus:outline-none"
                @focus="rememberCell($event, test.id, 'labels')"
                @blur="focusedCell = null"
                @change="emit('update', { id: test.id, field: 'labels', value: ($event.target as HTMLInputElement).value.split(',').map((label) => label.trim()).filter(Boolean) })"
                @keydown="onCellKeydown"
              />
            </template>
            <span v-else-if="test.readOnly">{{ test.labels?.join(', ') || '—' }}</span>
          </td>
          <td class="px-3 py-2">
            <select
              v-if="test.hydrated && !test.readOnly"
              :value="test.status"
              :aria-label="`Status for ${test.key}`"
              :class="test.draftFields?.status !== null && test.draftFields?.status !== undefined ? 'bg-(--soft) ring-1 ring-primary' : ''"
              class="rounded border border-transparent bg-transparent px-2 py-1 focus:border-primary focus:outline-none"
              @focus="rememberCell($event, test.id, 'status')"
              @blur="focusedCell = null"
              @change="emit('update', { id: test.id, field: 'status', value: ($event.target as HTMLSelectElement).value })"
              @keydown="onCellKeydown"
            >
              <option v-for="status in statuses ?? []" :key="status" :value="status">{{ status }}</option>
            </select>
            <span v-else>{{ test.status ?? (test.hydrated ? '—' : '') }}</span>
          </td>
          <td class="px-3 py-2 text-muted">{{ test.folderPath ?? '/' }}</td>
          <td class="max-w-56 px-3 py-2">
            <details v-if="test.gherkin" class="text-xs">
              <summary class="cursor-pointer text-primary">Preview</summary>
              <pre class="max-h-40 overflow-auto whitespace-pre-wrap">{{ test.gherkin }}</pre>
            </details>
            <button v-if="test.hydrationError" type="button" class="text-primary underline" @click="emit('retryHydration', test.id)">Retry details</button>
            <span v-if="test.hydrationError" role="alert" class="text-xs text-error">{{ test.hydrationError }}</span>
          </td>
          <td class="whitespace-nowrap px-3 py-2 text-xs">
            <span v-if="test.saveState === 'saving'" role="status">Saving…</span>
            <span v-else-if="test.saveState === 'saved'" role="status">Saved</span>
            <template v-else-if="test.saveState === 'error'"><span role="alert">Save failed</span> <button type="button" class="underline" @click="emit('retrySave', test.id)">Retry</button></template>
            <template v-if="test.hasDraft"><span v-if="test.testType && test.readOnly">Read-only</span><button type="button" class="ml-2 text-primary underline" @click="emit('revert', test.id)">Revert</button></template>
            <span v-else-if="test.readOnly">Read-only</span>
          </td>
        </tr>
        <tr v-if="bottomSpacer" aria-hidden="true"><td :colspan="8" :style="{ height: `${bottomSpacer}px`, padding: 0, border: 0 }" /></tr>
      </tbody>
    </table>
  </div>
</template>
