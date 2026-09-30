<script setup lang="ts">
withDefaults(defineProps<{ rows?: number; label?: string }>(), { rows: 5, label: 'Loading' })
</script>

<template>
  <div role="status" :aria-label="label" class="space-y-2">
    <span class="sr-only">{{ label }}…</span>
    <div
      v-for="row in rows"
      :key="row"
      class="h-8 animate-pulse rounded-md bg-muted"
      aria-hidden="true"
    />
  </div>
</template>
