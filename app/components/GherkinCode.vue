<script setup lang="ts">
const props = defineProps<{ source: string | null }>()

// Text only: every line is interpolated, never injected as HTML.
const lines = computed(() =>
  (props.source ?? '').split('\n').map((text) => ({
    text,
    comment: /^\s*#/.test(text),
    keyword: /^\s*(Feature|Rule|Background|Scenario Outline|Scenario|Examples):/.test(text),
    step: /^\s*(Given|When|Then|And|But)\b/.test(text),
    tag: /^\s*@/.test(text),
  })),
)
</script>

<template>
  <pre
    class="font-code overflow-auto rounded-lg border border-default bg-(--code) py-2.5 text-[13px] leading-5"
    tabindex="0"
    aria-label="Gherkin steps"
  ><code><span
    v-for="(line, index) in lines"
    :key="index"
    class="flex"
    :class="{
      'font-semibold text-primary': line.keyword,
      'text-success': line.step,
      'text-warning': line.tag,
      'italic text-[color-mix(in_srgb,var(--ink)_65%,var(--code))]': line.comment,
    }"
  ><span
    class="w-10 shrink-0 select-none pr-3 text-right text-[color-mix(in_srgb,var(--ink)_65%,var(--code))]"
    aria-hidden="true"
  >{{ index + 1 }}</span><span class="whitespace-pre pr-3">{{ line.text || ' ' }}</span></span></code></pre>
</template>
