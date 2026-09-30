<script setup lang="ts">
const { signedIn, workspace, signOut } = useWorkspaceSession()
const colorMode = useColorMode()
const menuOpen = ref(false)
const menu = ref<HTMLElement>()

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

function closeOnOutside(event: MouseEvent) {
  if (menu.value && !menu.value.contains(event.target as Node)) menuOpen.value = false
}

onMounted(() => document.addEventListener('click', closeOnOutside))
onBeforeUnmount(() => document.removeEventListener('click', closeOnOutside))
</script>

<template>
  <header
    class="sticky z-10 border-b border-default bg-elevated"
    style="top: env(safe-area-inset-top, 0px)"
  >
    <div class="flex flex-wrap items-center gap-3 px-5 py-2.5">
      <NuxtLink to="/" class="text-base font-bold text-highlighted" data-testid="app-name"
        >Xray<span class="text-primary">Bulk</span></NuxtLink
      >
      <nav
        v-if="signedIn && workspace?.jiraProjectKey"
        aria-label="Breadcrumb"
        class="flex items-center gap-2 text-muted"
        data-testid="header-project"
      >
        <span>{{ workspace.jiraProjectKey }}<span v-if="workspace.jiraProjectName"> · {{ workspace.jiraProjectName }}</span></span>
        <template v-if="workspace.projectReady">
          <span aria-hidden="true">›</span>
          <NuxtLink to="/repository" class="hover:text-highlighted">Repository</NuxtLink>
        </template>
      </nav>
      <!-- Reserved for the US-09 draft-count chip; renders nothing until drafts exist. -->
      <slot name="draft-chip" />
      <div class="ml-auto flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-default px-2.5 py-1 text-sm hover:bg-muted"
          aria-label="Toggle theme"
          data-testid="theme-toggle"
          @click="toggleTheme"
        >
          <ClientOnly>
            <span aria-hidden="true">{{ colorMode.value === 'dark' ? '☀' : '☾' }}</span>
            <template #fallback><span aria-hidden="true">☾</span></template>
          </ClientOnly>
        </button>
        <div v-if="signedIn" ref="menu" class="relative">
          <button
            type="button"
            class="rounded-lg border border-default px-3 py-1 text-sm hover:bg-muted"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            data-testid="user-menu"
            @click="menuOpen = !menuOpen"
            @keydown.escape="menuOpen = false"
          >
            Account
          </button>
          <div
            v-if="menuOpen"
            role="menu"
            class="absolute right-0 mt-1 min-w-40 rounded-lg border border-default bg-elevated p-1 shadow-md"
            @keydown.escape="menuOpen = false"
          >
            <NuxtLink
              to="/settings"
              role="menuitem"
              class="block rounded-md px-3 py-1.5 text-sm hover:bg-muted"
              @click="menuOpen = false"
              >Settings</NuxtLink
            >
            <button
              type="button"
              role="menuitem"
              class="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted"
              data-testid="logout"
              @click="signOut"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
