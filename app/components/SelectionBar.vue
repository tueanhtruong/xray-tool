<script setup lang="ts">
defineProps<{ count: number; opening: boolean }>()
defineEmits<{ clear: []; open: [] }>()
</script>

<template>
  <div
    v-if="count > 0"
    class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary bg-(--soft) px-3 py-2"
    role="region"
    aria-label="Selection"
    data-testid="selection-bar"
  >
    <strong class="text-primary" data-testid="selected-count">{{ count }} selected</strong>
    <button
      type="button"
      class="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-inverted hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
      :disabled="count !== 1 || opening"
      data-testid="open-selected"
      @click="$emit('open')"
    >
      {{ opening ? 'Opening…' : 'Open in editor' }}
    </button>
    <button
      type="button"
      class="rounded-lg border border-default bg-elevated px-3 py-1 text-xs hover:bg-muted"
      data-testid="clear-selection"
      @click="$emit('clear')"
    >
      Clear
    </button>
  </div>
</template>
