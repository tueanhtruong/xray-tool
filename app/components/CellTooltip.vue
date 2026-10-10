<script setup lang="ts">
const props = defineProps<{ text: string; testId: string }>()

const anchor = ref<HTMLElement>()
const open = ref(false)
const position = ref({ top: '0px', left: '0px' })
const tooltipId = computed(() => `cell-tip-${props.testId}`)

function show() {
  const target = anchor.value?.querySelector<HTMLElement>('input, span') ?? anchor.value
  if (!anchor.value || !target || target.scrollWidth <= target.clientWidth) return
  const rect = anchor.value.getBoundingClientRect()
  position.value = { top: `${rect.bottom + 6}px`, left: `${rect.left}px` }
  open.value = true
}

function hide() {
  open.value = false
}
</script>

<template>
  <div
    ref="anchor"
    class="min-w-0"
    :aria-describedby="open ? tooltipId : undefined"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <slot />
  </div>
  <Teleport to="body">
    <div
      v-if="open"
      :id="tooltipId"
      role="tooltip"
      class="fixed z-50 max-w-md select-text rounded-md border border-default bg-elevated px-2 py-1 text-xs shadow"
      :style="position"
    >
      {{ text }}
    </div>
  </Teleport>
</template>
