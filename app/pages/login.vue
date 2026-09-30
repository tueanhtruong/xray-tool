<script setup lang="ts">
import { safeNextPath } from '#shared/ui/safe-next-path'
import { validateApiTokenForm } from '#shared/ui/api-token-form'

type Tab = 'oauth' | 'token'

const route = useRoute()
const nextPath = computed(() => safeNextPath(route.query.next))
const oauthHref = computed(() =>
  nextPath.value ? `/auth/jira/login?next=${encodeURIComponent(nextPath.value)}` : '/auth/jira/login',
)

const tabs: Array<{ value: Tab; label: string }> = [
  { value: 'oauth', label: 'Atlassian OAuth' },
  { value: 'token', label: 'Email + API token' },
]
const tab = ref<Tab>('oauth')
const tabButtons = ref<HTMLButtonElement[]>([])

function selectTab(value: Tab, focus = false) {
  tab.value = value
  if (focus) nextTick(() => tabButtons.value[tabs.findIndex((t) => t.value === value)]?.focus())
}

function onTabKeydown(event: KeyboardEvent) {
  const index = tabs.findIndex((t) => t.value === tab.value)
  const last = tabs.length - 1
  let target: number | undefined
  if (event.key === 'ArrowRight') target = index === last ? 0 : index + 1
  else if (event.key === 'ArrowLeft') target = index === 0 ? last : index - 1
  else if (event.key === 'Home') target = 0
  else if (event.key === 'End') target = last
  if (target === undefined) return
  event.preventDefault()
  selectTab(tabs[target]!.value, true)
}

const message = computed(() => {
  const value = route.query.message
  if (value === 'access-denied')
    return 'Atlassian access was not granted. You can try again when ready.'
  if (value === 'verification-failed') return 'Sign-in could not be verified. Please try again.'
  if (value === 'configuration') {
    const missing =
      typeof route.query.missing === 'string' ? route.query.missing : 'Atlassian OAuth settings'
    return `Sign-in is not configured. Set ${missing} in .env. See docs/setup-atlassian-oauth.md.`
  }
  if (value === 'oauth-failed') {
    return typeof route.query.detail === 'string'
      ? route.query.detail
      : 'Atlassian sign-in could not be completed. Please try again.'
  }
  if (typeof value === 'string' && value.length > 0) return value
  return ''
})

const apiTokenForm = reactive({ siteUrl: '', email: '', apiToken: '' })
const apiTokenError = ref('')
const existingConnection = ref(false)
const apiTokenPending = ref(false)
const validation = computed(() => validateApiTokenForm(apiTokenForm))

async function signInWithApiToken() {
  if (!validation.value.valid) return
  apiTokenError.value = ''
  existingConnection.value = false
  apiTokenPending.value = true
  try {
    const result = await $fetch<{ redirectTo: string }>('/api/auth/jira/api-token', {
      method: 'POST',
      body: { ...apiTokenForm, next: nextPath.value },
    })
    await navigateTo(result.redirectTo, { external: true })
  } catch (error) {
    existingConnection.value = Boolean(
      error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 409,
    )
    apiTokenError.value =
      error && typeof error === 'object' && 'data' in error &&
      error.data && typeof error.data === 'object' && 'message' in error.data &&
      typeof error.data.message === 'string'
        ? error.data.message
        : 'Jira sign-in could not be completed. Please try again.'
  } finally {
    apiTokenPending.value = false
    apiTokenForm.apiToken = ''
  }
}

useHead({ title: 'Sign in · XrayBulk' })
</script>

<template>
  <main class="mx-auto my-12 max-w-[420px] px-4">
    <PageCard>
      <h1 class="text-xl font-semibold text-highlighted">Connect to Jira</h1>
      <p class="mt-1 text-muted">Sign in to browse and edit your Xray tests.</p>
      <ErrorBanner v-if="message" class="mt-4" :message="message" data-testid="login-message" />

      <div
        role="tablist"
        aria-label="Sign-in method"
        class="mb-1 mt-4 flex border-b border-default"
        @keydown="onTabKeydown"
      >
        <button
          v-for="t in tabs"
          :id="`tab-${t.value}`"
          :key="t.value"
          ref="tabButtons"
          type="button"
          role="tab"
          :aria-selected="tab === t.value"
          :aria-controls="`panel-${t.value}`"
          :tabindex="tab === t.value ? 0 : -1"
          class="-mb-px flex-1 border-b-2 px-2 py-2 text-center"
          :class="
            tab === t.value
              ? 'border-primary font-semibold text-highlighted'
              : 'border-transparent text-muted hover:text-highlighted'
          "
          @click="selectTab(t.value)"
        >
          {{ t.label }}
        </button>
      </div>

      <div
        v-show="tab === 'oauth'"
        id="panel-oauth"
        role="tabpanel"
        aria-labelledby="tab-oauth"
        class="pt-3"
      >
        <a
          :href="oauthHref"
          class="block w-full rounded-lg bg-primary px-4 py-2.5 text-center font-medium text-inverted hover:opacity-90"
          data-testid="jira-login"
          >Continue with Atlassian</a
        >
        <p class="mt-3 text-xs text-muted">
          You'll be redirected to Atlassian to approve access. Tokens are encrypted and never sent
          to your browser.
        </p>
      </div>

      <div
        v-show="tab === 'token'"
        id="panel-token"
        role="tabpanel"
        aria-labelledby="tab-token"
        class="pt-3"
      >
        <form class="space-y-3" data-testid="api-token-form" novalidate @submit.prevent="signInWithApiToken">
          <UFormField label="Jira site URL" name="siteUrl" :error="validation.errors.siteUrl">
            <UInput
              v-model="apiTokenForm.siteUrl"
              class="w-full"
              type="url"
              inputmode="url"
              placeholder="https://acme.atlassian.net"
              autocomplete="off"
            />
          </UFormField>
          <UFormField label="Email" name="email" :error="validation.errors.email">
            <UInput
              v-model="apiTokenForm.email"
              class="w-full"
              type="email"
              placeholder="you@company.com"
              autocomplete="username"
            />
          </UFormField>
          <UFormField label="API token" name="apiToken">
            <UInput
              v-model="apiTokenForm.apiToken"
              class="w-full"
              type="password"
              placeholder="••••••••"
              autocomplete="off"
            />
          </UFormField>
          <div v-if="apiTokenError" class="space-y-3" data-testid="api-token-error">
            <ErrorBanner :message="apiTokenError" />
            <a
              v-if="existingConnection"
              class="inline-flex items-center rounded-lg bg-primary px-4 py-2 font-medium text-inverted"
              href="/auth/jira/login"
              data-testid="open-existing-connection"
            >
              Sign in with Atlassian to manage connection
            </a>
          </div>
          <button
            type="submit"
            class="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-inverted hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            :disabled="!validation.valid || apiTokenPending"
            data-testid="api-token-submit"
          >
            <span
              v-if="apiTokenPending"
              class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
            {{ apiTokenPending ? 'Verifying…' : 'Verify & connect' }}
          </button>
        </form>
      </div>
    </PageCard>
  </main>
</template>
