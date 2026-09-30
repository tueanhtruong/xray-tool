<script setup lang="ts">
const props = withDefaults(defineProps<{ tone?: 'ok' | 'warn' | 'bad' | 'neutral' }>(), {
  tone: 'neutral',
})

const classes = computed(
  () =>
    ({
      ok: 'border-(--ok) text-(--ok)',
      warn: 'border-(--warn) text-(--warn)',
      bad: 'border-(--bad) text-(--bad)',
      neutral: 'border-default text-muted',
    })[props.tone],
)
</script>

<template>
  <span
    class="inline-block rounded-md border px-2 text-xs font-semibold"
    :class="classes"
  >
    <slot />
  </span>
</template>
