## Context

See `proposal.md` for motivation and `specs/` for requirements. Current state that shapes the approach:

- `app/` has no layout, no shared components, and no tokens; `main.css` only imports Tailwind and Nuxt UI. `index.vue` (309 lines) is the workspace setup page, `repository.vue` (230 lines) mixes data loading, tree, table, and a modal, and `editor.vue` is a stub.
- `server/middleware/01.auth.ts` guards only `/` and APIs (`pathname !== '/'` shortcut). `02.project-ready.ts` guards `/repository*` and redirects to `/`.
- Three server routes hard-code a redirect to `/` after sign-in: OAuth callback, site-selection POST, and API-token POST (the last is consumed by a client `$fetch` that then calls `navigateTo('/')`).
- The app session stores `{ userId, activeWorkspaceId }` only, so nuxt-auth-utils' `loggedIn` (derived from `session.user`) is always false.
- `GET /api/auth/session` returns 401 when signed out; `GET /api/tests/[id]` is keyed by cuid; selection and detail routes duplicate the Xray detail mapper.
- `vue/no-v-html` is a warning in the effective lint config. The mock has read counters but no write counter. e2e specs each copy their own sign-in helper.
- `refer/template` (prototype + UI-SPEC) is the visual reference and is not code to copy. ADR 0015 records the route and UI-kit decisions.

## Goals / Non-Goals

**Goals:**
- One design-token source that styles both custom markup and Nuxt UI components in both themes.
- A single server-side definition of "where does a user go after sign-in" and "what is a safe `next`".
- Moving routes without losing behavioral coverage: every existing e2e assertion survives, only URLs change.
- Reserve, but do not build, slots for US-09 to US-16 UI (draft chip, columns, bulk actions).

**Non-Goals:**
- Drafts, inline editing, labels/status columns, bulk actions, Gherkin editor, diff view, demo mode.
- Virtualized rows, CodeMirror, cross-page selection, multi-instance coordination.
- New Jira/Xray calls or any remote write.
- Changing the session shape (it stays ID-only).

## Decisions

### D1. Tokens as CSS variables, mapped onto Nuxt UI
Define the template tokens on `:root` and under `.dark` in `main.css`, then point Nuxt UI's semantic colors (`--ui-primary`, `--ui-bg`, `--ui-border`, text colors) at them via `app.config.ts` and `main.css`. Custom markup uses the tokens through Tailwind arbitrary values or small utility classes; components never hard-code hex values (the existing `#b91c1c` and red/green classes in `repository.vue` are replaced by `--bad`/`--ok`).
- Alternative: rely on Nuxt UI palette only. Rejected: the template's exact hex values are acceptance criteria.
- Alternative: copy the prototype's CSS. Rejected: it targets `[data-theme]` and would fork the styling of built-in components.

### D2. Nuxt UI color mode, no `[data-theme]`
`@nuxt/ui` already registers `@nuxtjs/color-mode` (`.dark` on `<html>`, system default, `localStorage` persistence). The toggle is a small button over `useColorMode()` with an `aria-label`. Contrast for the primary button label is chosen per theme (light `--brand` with white text; dark `--brand` `#818cf8` with dark text) to keep 4.5:1.
- Alternative: a `[data-theme]` attribute synced from color mode. Rejected: two mechanisms for one state.

### D3. Explicit protected-page list and `next`
Replace the `pathname !== '/'` shortcut in `01.auth.ts` with a protected set: `/settings`, `/repository` (and subpaths), `/tests/` prefix. `/`, `/login`, `/auth/*`, `/api/auth/*` stay public as today. Unauthenticated page requests redirect to `/login?next=<encodeURIComponent(path + search)>`. `02.project-ready.ts` adds `/tests/*` to its page set and redirects to `/settings`. Middleware ordering is unchanged (`01` before `02`, so signed-out users never reach the readiness lookup).
`safeNextPath(input): string | undefined` lives in `shared/` (pure TS, no framework imports, per lint rules) and is unit tested: must start with one `/`, not `//`, no `\`, no scheme, no control characters, at most 2048 characters.

### D4. Carry `next` through OAuth in a signed cookie
`/auth/jira/login?next=<path>` validates `next` and stores it in a third signed, HttpOnly, SameSite=Lax, 10-minute cookie (`login_next`) using the existing `oauth-cookies.ts` HMAC helpers. The callback (single site) and the site-selection POST both call one helper, `resolvePostLoginPath(event)`, which reads and clears the cookie, re-validates with `safeNextPath`, and returns `next ?? '/repository'`. The API-token POST takes `next` from the JSON body, validates it, and returns `{ redirectTo }` (status 200); the login page navigates with `navigateTo(redirectTo, { external: false })`.
- Readiness is deliberately not looked up at login: `/repository` for an unready workspace is redirected to `/settings` by `02.project-ready`, so the scenario "no project selected lands on `/settings`" costs one extra hop and zero new code paths.
- Alternative: put `next` in the OAuth `state` parameter. Rejected: state is verified against a cookie and opaque to the mock; a separate cookie leaves the verified-state contract untouched.
- Alternative: keep the 303 from API-token and let `$fetch` follow. Rejected: the client receives HTML of the destination and cannot navigate deliberately; JSON is explicit and testable. This is a breaking change to `auth-oauth`/US-03 assertions and is listed in tasks.

### D5. Signed-in bounce from `/login`
A small server middleware (same file as the guard or a sibling) redirects `GET /login` for a valid session to `safeNextPath(query.next) ?? '/repository'`. Server-side avoids a flash of the login form and keeps SSR consistent. OAuth failure redirects to `/login?message=…` are only hit by users who are not signed in, so there is no loop.

### D6. Session awareness in the UI
- A composable `useWorkspaceSession()` wraps `useFetch('/api/auth/session')` and is used by the header and the settings/repository pages.
- Public pages (`/`, `/login`) first check `useUserSession().session.value.userId` (present when signed in, absent otherwise) and only then call the composable, so a signed-out landing visit makes no API call and logs no 401.
- Landing CTA: `Sign in with Jira` (signed out), `Open repository` (ready), `Continue setup` (signed in, not ready) using the `projectReady` field already returned.
- Alternative: new public `/api/auth/state` endpoint. Rejected as unnecessary surface area.

### D7. Key lookup and a shared detail service
Extract the Xray-detail fetch + mapper (today duplicated as `asRecord` and mapping code in `tests/[testCaseId].get.ts` and `tests/selection.post.ts`) into `server/services/test-details.ts`. Add `GET /api/tests/by-key/:key`: same session/readiness preamble, key format validated (Jira key pattern), `findFirst({ workspaceId, jiraProjectId, key, origin: 'REMOTE' })`, 404 when absent, then the shared fetch with the existing issue-id consistency check. Nothing is persisted. The existing id-based detail route stays for compatibility with the modal-free list (it is no longer used by the UI but its integration tests remain valid).
- Alternative: make `[testCaseId]` accept keys. Rejected: cuid vs key ambiguity.

### D8. Component layout and page structure
- `app/layouts/default.vue` renders `AppHeader` + slot; `app.vue` uses `NuxtLayout`.
- Shared: `AppHeader`, `PageCard`, `StatusBadge`, `Chip`, `EmptyState`, `ErrorBanner`, `LoadingSkeleton`.
- Repository: `FolderTree` (replaces `RepositoryFolderNode`), `TestList`, `SelectionBar`; `repository.vue` becomes a thin page that owns URL state and data fetching.
- Settings: `index.vue` moves to `settings.vue`, split into `SettingsJiraCard`, `SettingsXrayCard`, `SettingsProjectCard`, `SettingsPullCard`; `data-testid`s used by existing specs are preserved.
- Login: `LoginOAuthTab`, `LoginApiTokenTab`; the API-token form validator is a pure function in `shared/` so it is unit tested in the `node` Vitest project (no DOM environment is configured).
- Test page: `tests/[key].vue`; `GherkinCode` is reused unchanged except for adding `#` comment styling and line numbers (the template shows both); no `v-html`.
- A `jiraIssueUrl(siteUrl, key)` helper moves from `repository.vue` into `shared/` and is used by the test page.

### D9. Mock write-request counter
In `packages/mock-services`, a counter increments for any `/rest/api/*` request whose method is not GET and for any Xray GraphQL request whose query begins with `mutation`; OAuth token exchange and Xray `/authenticate` are excluded. `GET /__control` returns `writeRequestCount`; `POST /__control` accepts `resetWriteRequestCount`. The redesign e2e spec asserts it is 0 at the end of the spec.

### D10. Tests and tooling
- `e2e/support/` gains `signIn`, `control`, and `writeRequestCount` helpers; every spec touched for moved routes migrates to them instead of adding more copies.
- `vue/no-v-html` set to `error`; `architecture-guard.test.ts` gains a case.
- e2e computes token colors via `getComputedStyle` in both themes and asserts `scrollWidth <= clientWidth` on `document.documentElement` at 375 px. Axe runs per screen per theme (serious/critical only, as today).
- Pagination stays Previous/Next from US-08; "select all" selects the visible page only and the selection bar text says so through the count ("N selected").

## Risks / Trade-offs

- [Route move breaks many specs at once] → Slice the work so routing/guards and spec migration land and pass before any visual work; run the full e2e suite at that point.
- [Open redirect via `next`] → Single pure validator reused at parse time and at redirect time, exhaustive unit tests, and an e2e with an external URL.
- [Landing flashes the wrong CTA after hydration] → Session check reads the sealed-session cookie during SSR, so server and client render the same branch; covered by an e2e with a signed-in page load.
- [API-token response contract change] → Only the login page consumes it; update US-03 spec and integration assertions in the same commit.
- [Dark-mode contrast regressions] → Axe in both themes on every screen, plus per-theme primary-button colors.
- [Public `/` makes `jira-refresh` and `auth-oauth` assertions stale] → Point those assertions at `/settings`; listed in tasks.
- [`useUserSession().loggedIn` misleads future contributors] → Wrap in `useWorkspaceSession()` and note in `docs/conventions.md`.

## Migration Plan

1. Land foundations (shared validators, lint severity, mock counter, e2e helpers) with no behavior change.
2. Land routing and guards together with the spec migration; `pnpm check` and the full e2e suite must pass.
3. Land design system and shell, then each screen.
4. Finish with the new e2e spec, docs (ADR 0015 → accepted, architecture/conventions), and progress entry.
Rollback is a git revert of the story commits; there is no data or schema change.

## Open Questions

- Commit `refer/template/` to the repository or gitignore it? It currently sits untracked and does not affect behavior.
