<script setup lang="ts">
defineProps<{ title?: string; description?: string }>()
</script>

<template>
  <section class="rounded-xl border border-default bg-elevated p-5">
    <header v-if="title || $slots.header" class="mb-3">
      <slot name="header">
        <h2 class="text-base font-semibold text-highlighted">{{ title }}</h2>
        <p v-if="description" class="mt-0.5 text-sm text-muted">{{ description }}</p>
      </slot>
    </header>
    <slot />
  </section>
</template>
