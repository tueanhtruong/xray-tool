<script setup lang="ts">
export interface FolderNode {
  path: string
  name: string
  remoteTestsCount: number
  folders: FolderNode[]
}

interface VisibleRow {
  path: string
  name: string
  count: number | null
  level: number
  parent: string | null
  hasChildren: boolean
  expanded: boolean
}

const props = defineProps<{
  folders: FolderNode[]
  selectedPath: string
  expandedPaths: string[]
}>()

const emit = defineEmits<{
  toggle: [path: string]
  select: [path: string]
}>()

const ROOT = '/'

const rows = computed<VisibleRow[]>(() => {
  const result: VisibleRow[] = [
    { path: ROOT, name: 'All tests', count: null, level: 1, parent: null, hasChildren: false, expanded: false },
  ]
  const walk = (nodes: FolderNode[], level: number, parent: string) => {
    for (const node of nodes) {
      const expanded = props.expandedPaths.includes(node.path)
      result.push({
        path: node.path,
        name: node.name,
        count: node.remoteTestsCount,
        level,
        parent,
        hasChildren: node.folders.length > 0,
        expanded,
      })
      if (expanded && node.folders.length > 0) walk(node.folders, level + 1, node.path)
    }
  }
  walk(props.folders, 1, ROOT)
  return result
})

const effectiveSelected = computed(() => props.selectedPath || ROOT)
const focusedPath = ref<string>()
const items = ref<HTMLElement[]>([])

const tabbablePath = computed(() => {
  const candidate = focusedPath.value ?? effectiveSelected.value
  return rows.value.some((row) => row.path === candidate) ? candidate : ROOT
})

function focusRow(path: string) {
  focusedPath.value = path
  nextTick(() => {
    items.value.find((element) => element.dataset.path === path)?.focus()
  })
}

function onKeydown(event: KeyboardEvent, row: VisibleRow) {
  const index = rows.value.findIndex((candidate) => candidate.path === row.path)
  const go = (target: VisibleRow | undefined) => {
    if (!target) return
    event.preventDefault()
    focusRow(target.path)
  }
  switch (event.key) {
    case 'ArrowDown':
      go(rows.value[index + 1])
      break
    case 'ArrowUp':
      go(rows.value[index - 1])
      break
    case 'Home':
      go(rows.value[0])
      break
    case 'End':
      go(rows.value[rows.value.length - 1])
      break
    case 'ArrowRight':
      if (row.hasChildren && !row.expanded) {
        event.preventDefault()
        emit('toggle', row.path)
      } else if (row.hasChildren && row.expanded) {
        go(rows.value[index + 1])
      }
      break
    case 'ArrowLeft':
      if (row.hasChildren && row.expanded) {
        event.preventDefault()
        emit('toggle', row.path)
      } else {
        go(rows.value.find((candidate) => candidate.path === row.parent))
      }
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      emit('select', row.path)
      break
  }
}

function onClick(row: VisibleRow) {
  focusedPath.value = row.path
  emit('select', row.path)
}
</script>

<template>
  <nav aria-label="Test folders">
    <div class="mx-2 mb-1 text-xs font-semibold text-muted" aria-hidden="true">FOLDERS</div>
    <ul role="tree" aria-label="Folders" class="space-y-px">
      <li
        v-for="row in rows"
        :key="row.path"
        ref="items"
        role="treeitem"
        :data-path="row.path"
        :aria-level="row.level"
        :aria-selected="effectiveSelected === row.path"
        :aria-expanded="row.hasChildren ? row.expanded : undefined"
        :tabindex="tabbablePath === row.path ? 0 : -1"
        class="flex cursor-pointer items-center justify-between gap-2 rounded-md py-1 pr-2 hover:bg-muted"
        :class="effectiveSelected === row.path ? 'bg-(--soft) font-semibold text-primary' : ''"
        :style="{ paddingLeft: `${8 + (row.level - 1) * 16}px` }"
        @click="onClick(row)"
        @keydown="onKeydown($event, row)"
      >
        <span class="flex min-w-0 items-center gap-1">
          <span
            class="inline-block w-4 shrink-0 text-center text-muted"
            aria-hidden="true"
            @click.stop="row.hasChildren && emit('toggle', row.path)"
            >{{ row.hasChildren ? (row.expanded ? '▾' : '▸') : '' }}</span
          >
          <span class="truncate">{{ row.name }}</span>
        </span>
        <span v-if="row.count !== null" class="text-xs" :class="effectiveSelected === row.path ? '' : 'text-muted'">{{ row.count }}</span>
      </li>
    </ul>
  </nav>
</template>
