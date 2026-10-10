<script setup lang="ts">
import { trimFolderPath } from '#shared/drafts/folder-trim'

const props = defineProps<{ path: string | null; testId: string; maxLength?: number }>()

const full = computed(() => props.path ?? '/')
const shown = computed(() => trimFolderPath(full.value, props.maxLength ?? 28))
const trimmed = computed(() => shown.value !== full.value)
const tooltipId = computed(() => `folder-tip-${props.testId}`)
const anchor = ref<HTMLElement>()
const open = ref(false)
const position = ref({ top: '0px', left: '0px' })

function show() {
  if (!trimmed.value || !anchor.value) return
  const rect = anchor.value.getBoundingClientRect()
  position.value = { top: `${rect.bottom + 6}px`, left: `${rect.left}px` }
  open.value = true
}

function hide() {
  open.value = false
}
</script>

<template>
  <span
    ref="anchor"
    tabindex="0"
    class="block truncate text-muted"
    :aria-describedby="open && trimmed ? tooltipId : undefined"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
    @keydown.esc="hide"
    >{{ shown }}</span
  >
  <Teleport to="body">
    <div
      v-if="open && trimmed"
      :id="tooltipId"
      role="tooltip"
      class="fixed z-50 max-w-md select-text rounded-md border border-default bg-elevated px-2 py-1 text-xs shadow"
      :style="position"
    >
      {{ full }}
    </div>
  </Teleport>
</template>
