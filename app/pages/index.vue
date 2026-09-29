<script setup lang="ts">
const appName = 'Xray Tool'

useHead({ title: appName })
</script>

<template>
  <UContainer class="py-16">
    <h1 class="text-3xl font-semibold" data-testid="app-name">{{ appName }}</h1>
    <p class="mt-2 text-muted">Bulk-edit and sync BDD test cases with Jira and Xray.</p>
  </UContainer>
</template>
