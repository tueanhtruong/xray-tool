<script setup lang="ts">
const route = useRoute()
const ids = computed(() => typeof route.query.ids === 'string'
  ? route.query.ids.split(',').filter(Boolean)
  : [])

useHead({ title: 'Editor' })
</script>

<template>
  <UContainer class="py-8">
    <h1 class="text-3xl font-semibold">Editor</h1>
    <p class="mt-3">The bulk editor will be available in a later release.</p>
    <p v-if="ids.length" class="mt-2">{{ ids.length }} tests selected.</p>
    <NuxtLink to="/repository" class="mt-4 inline-block underline">Back to Test Repository</NuxtLink>
  </UContainer>
</template>
