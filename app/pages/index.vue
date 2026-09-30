<script setup lang="ts">
const { signedIn, workspace } = useWorkspaceSession()

const cta = computed(() => {
  if (!signedIn.value) return { label: 'Sign in with Jira', to: '/login' }
  if (workspace.value && !workspace.value.projectReady) {
    return { label: 'Continue setup', to: '/settings' }
  }
  return { label: 'Open repository', to: '/repository' }
})

const steps = ['Pull', 'Edit drafts', 'Import .md', 'Review diff', 'Sync', 'Export']

const features = [
  {
    title: 'Bulk editor grid',
    text: 'Edit summary, labels and status inline. Autosaved drafts, undo, no remote writes.',
  },
  {
    title: 'Gherkin steps editor',
    text: 'Highlighting, live validation and side-by-side comparison with Xray.',
  },
  {
    title: 'Conflict-aware sync',
    text: 'Three-way diff catches remote changes before anything is overwritten.',
  },
  {
    title: 'Markdown import / export',
    text: 'Round-trip scenarios as .md — export then import is a no-op.',
  },
  {
    title: 'Secure by design',
    text: 'Encrypted tokens, redacted logs, secrets never reach the browser.',
  },
  {
    title: 'Audit history',
    text: 'Every sync batch with applied diffs, errors and retry-failed.',
  },
]

useHead({ title: 'XrayBulk · Bulk-edit Xray test cases' })
</script>

<template>
  <main>
    <div class="mx-auto max-w-[900px] px-5 pb-8 pt-16 text-center">
      <AppChip>Jira + Xray Cloud</AppChip>
      <h1 class="mb-4 mt-4 text-[clamp(30px,5vw,48px)] font-bold leading-[1.1] tracking-tight text-highlighted">
        Edit hundreds of Xray test cases <span class="text-primary">in one place</span>
      </h1>
      <p class="mx-auto mb-6 max-w-[620px] text-[17px] text-muted">
        Pull your test repository, bulk-edit as local drafts, import Gherkin from Markdown, review
        every diff, then sync back safely.
      </p>
      <UButton :to="cta.to" size="xl" data-testid="landing-cta">{{ cta.label }}</UButton>
      <ol class="mt-8 flex flex-wrap justify-center gap-2" aria-label="Workflow" data-testid="workflow-steps">
        <li
          v-for="(step, index) in steps"
          :key="step"
          class="rounded-full border border-default bg-elevated px-3 py-1 text-xs"
        >
          {{ index + 1 }} {{ step }}
        </li>
      </ol>
    </div>
    <ul
      class="mx-auto my-6 grid max-w-[1000px] gap-3.5 px-5"
      style="grid-template-columns: repeat(auto-fit, minmax(230px, 1fr))"
      aria-label="Features"
    >
      <li v-for="feature in features" :key="feature.title" data-testid="feature-card">
        <PageCard class="h-full">
          <h2 class="font-semibold text-highlighted">{{ feature.title }}</h2>
          <p class="mt-1 text-muted">{{ feature.text }}</p>
        </PageCard>
      </li>
    </ul>
  </main>
</template>
