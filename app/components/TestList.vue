<script setup lang="ts">
export interface RepositoryTest {
  id: string
  key: string
  summary: string
  folderPath: string | null
  remoteDeletedAt: string | null
  issueId: string
}

const props = defineProps<{
  tests: RepositoryTest[]
  selectedIds: string[]
  linkQuery: Record<string, string>
  busy?: boolean
}>()

const emit = defineEmits<{
  toggle: [id: string]
  toggleAll: []
}>()

const allSelected = computed(
  () => props.tests.length > 0 && props.tests.every((test) => props.selectedIds.includes(test.id)),
)
const someSelected = computed(
  () => !allSelected.value && props.tests.some((test) => props.selectedIds.includes(test.id)),
)
const headerCheckbox = ref<HTMLInputElement>()
watchEffect(() => {
  if (headerCheckbox.value) headerCheckbox.value.indeterminate = someSelected.value
})
</script>

<template>
  <div
    class="overflow-x-auto rounded-xl border border-default bg-elevated"
    :aria-busy="busy ? 'true' : undefined"
    :class="busy ? 'opacity-60' : ''"
  >
    <table class="w-full min-w-[640px] border-collapse text-left">
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
          <th scope="col" class="px-3 py-2 font-semibold">Folder</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="test in tests" :key="test.id" class="border-b border-default last:border-b-0">
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
              >{{ test.key }}</NuxtLink
            >
            <StatusBadge v-if="test.remoteDeletedAt" tone="bad" class="ml-2">Remote deleted</StatusBadge>
          </td>
          <td class="px-3 py-2">{{ test.summary }}</td>
          <td class="px-3 py-2 text-muted">{{ test.folderPath ?? '/' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
