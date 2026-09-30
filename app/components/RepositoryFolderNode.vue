<script setup lang="ts">
interface Folder {
  path: string
  name: string
  remoteTestsCount: number
  folders: Folder[]
}

const props = defineProps<{
  folder: Folder
  selectedPath: string
  expandedPaths: string[]
}>()

const emit = defineEmits<{
  toggle: [path: string]
  select: [path: string]
}>()

function expandLabel(path: string, name: string) {
  return props.expandedPaths.includes(path) ? `Collapse ${name}` : `Expand ${name}`
}
</script>

<template>
  <li class="py-1">
    <div class="flex items-center gap-1">
      <button
        class="w-6"
        :aria-label="expandLabel(folder.path, folder.name)"
        :aria-expanded="expandedPaths.includes(folder.path)"
        @click="emit('toggle', folder.path)"
      >
        {{ expandedPaths.includes(folder.path) ? '−' : '+' }}
      </button>
      <span class="w-6" />
      <button
        class="flex-1 rounded px-2 py-1 text-left"
        :aria-current="selectedPath === folder.path ? 'page' : undefined"
        @click="emit('select', folder.path)"
      >
        {{ folder.name }} <span class="text-muted">({{ folder.remoteTestsCount }})</span>
      </button>
    </div>
    <ul v-if="folder.folders.length && expandedPaths.includes(folder.path)" class="ml-5 border-l pl-2">
      <RepositoryFolderNode
        v-for="child in folder.folders"
        :key="child.path"
        :folder="child"
        :selected-path="selectedPath"
        :expanded-paths="expandedPaths"
        @toggle="emit('toggle', $event)"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>
