<script setup lang="ts">
defineProps<{ title?: string; message: string; retryable?: boolean; retryLabel?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    role="alert"
    class="flex flex-wrap items-center gap-3 rounded-lg border border-(--bad) bg-elevated px-4 py-3 text-sm"
  >
    <div class="min-w-0 flex-1">
      <p v-if="title" class="font-semibold text-(--bad)">{{ title }}</p>
      <p class="text-default">{{ message }}</p>
    </div>
    <button
      v-if="retryable"
      type="button"
      class="rounded-lg border border-default px-3 py-1 font-medium hover:bg-muted"
      @click="$emit('retry')"
    >
      {{ retryLabel ?? 'Try again' }}
    </button>
  </div>
</template>
