<script setup lang="ts">
const props = defineProps<{ source: string | null }>()

const lines = computed(() => (props.source ?? '').split('\n').map((text) => ({
  text,
  keyword: /^\s*(Feature|Rule|Background|Scenario Outline|Scenario|Examples):/.test(text),
  step: /^\s*(Given|When|Then|And|But)\b/.test(text),
  tag: /^\s*@/.test(text),
})))
</script>

<template>
  <pre class="overflow-auto rounded bg-muted p-3"><code><span v-for="(line, index) in lines" :key="index" class="block" :class="{ 'text-primary font-semibold': line.keyword, 'text-success': line.step, 'text-warning': line.tag }">{{ line.text || ' ' }}</span></code></pre>
</template>
