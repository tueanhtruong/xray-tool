## 1. Foundations (no visible change)

- [x] 1.1 Add `safeNextPath` in `shared/` (pure TS) and `tests/unit/ui/safe-next-path.test.ts` covering relative paths, `//`, scheme, backslash, control chars, length cap
- [x] 1.2 Add the API-token form validator in `shared/` (site URL `https://<site>.atlassian.net`, email, token present) and `tests/unit/ui/api-token-form.test.ts`
- [x] 1.3 Move `jiraIssueUrl` from `repository.vue` into `shared/` with a unit test (encoding, no trailing slash issues)
- [x] 1.4 Set `vue/no-v-html` to `error` in `eslint.config.mjs` and add a case to `tests/unit/architecture-guard.test.ts`
- [x] 1.5 Add the write-request counter to `packages/mock-services` (non-GET Jira REST, GraphQL `mutation`; exclude OAuth token and Xray authenticate) with `writeRequestCount` in `GET /__control` and `resetWriteRequestCount` in `POST /__control`; extend `tests/integration/mock-services.test.ts`
- [x] 1.6 Create `e2e/support/` with `signIn`, `control`, and `writeRequestCount` helpers

## 2. Test-detail service and key lookup

- [x] 2.1 Extract the Xray detail fetch and mapper shared by `tests/[testCaseId].get.ts` and `tests/selection.post.ts` into `server/services/test-details.ts`; existing integration tests stay green
- [x] 2.2 Add `GET /api/tests/by-key/:key` (session, readiness, key-format validation, workspace+project scoped lookup, 404, no persistence)
- [x] 2.3 Integration tests in `tests/integration/route-guards.test.ts`: known key 200, unknown key 404, other-workspace key 404, unready workspace 409, signed-out 401, nothing persisted

## 3. Routing, guards, and sign-in redirects

- [x] 3.1 Replace the `/` shortcut in `server/middleware/01.auth.ts` with an explicit protected-page list; redirect to `/login?next=<encoded path+query>`
- [x] 3.2 Redirect signed-in `GET /login` to the validated `next` or `/repository`
- [x] 3.3 Update `02.project-ready.ts`: cover `/tests/*` and redirect to `/settings`
- [x] 3.4 Add the signed `login_next` cookie helpers to `oauth-cookies.ts`; accept and validate `next` in `/auth/jira/login`
- [x] 3.5 Add `resolvePostLoginPath` and use it in the OAuth callback (single site) and the site-selection POST
- [x] 3.6 Change the API-token POST to accept `next` and return JSON `{ redirectTo }` instead of a 303
- [x] 3.7 Move `app/pages/index.vue` to `app/pages/settings.vue`; add a placeholder landing at `/index.vue`; delete `app/pages/editor.vue`; point all in-app links and `navigateTo` calls at the new routes
- [x] 3.8 Extend `tests/integration/route-guards.test.ts`: public vs protected pages, `next` redirect, signed-in `/login` bounce, open-redirect refusal, tampered cookie falls back to default, `/tests/*` readiness redirect
- [x] 3.9 Update existing integration assertions (`auth-oauth.test.ts`, `jira-refresh.test.ts`, `project-selection.test.ts`, `auth-api-token.test.ts`) for the public `/`, `/settings` redirect, and the JSON API-token response
- [x] 3.10 Migrate e2e specs `us-00` through `us-08` to the new routes and `e2e/support` helpers, keeping every behavioral assertion; run the full `pnpm test:e2e`

## 4. Design system and shell

- [x] 4.1 Define the tokens for light and dark in `app/assets/css/main.css` and map Nuxt UI semantic colors in `app.config.ts`; set per-theme primary-button label colors
- [x] 4.2 Add `app/layouts/default.vue` and `AppHeader` (logo, project breadcrumb, theme toggle with `aria-label`, sign-out menu, reserved draft-chip slot)
- [x] 4.3 Add `useWorkspaceSession()` (checks `useUserSession().session.value.userId` first) and use it in the header
- [x] 4.4 Add `PageCard`, `StatusBadge`, `Chip`, `EmptyState`, `ErrorBanner`, `LoadingSkeleton`
- [x] 4.5 Add `viewport-fit=cover` and safe-area padding for the sticky header and body

## 5. Screens

- [x] 5.1 Landing `/`: hero, badge, workflow pills, six feature cards (copy from `refer/template/index.html`), CTA variants per session state, no API call when signed out
- [x] 5.2 Login `/login`: tabs (OAuth default, API token), keyboard operable, error banner for `?message=`, preserve `next` on the OAuth link, client-side validation, pending state, token cleared after submit, navigate to `redirectTo`
- [x] 5.3 Restyle `/auth/jira/select-site` with the shared components, same behavior
- [x] 5.4 Split `/settings` into cards, keeping the `data-testid`s and labels the existing specs rely on
- [x] 5.5 `FolderTree` with "All tests" root, counts, keyboard navigation, persisted expansion, and the pull button with progress
- [x] 5.6 `TestList` (Select, Key link, Summary, Folder), header select-all-visible, in-card horizontal scroll, pagination controls, loading/empty/error states
- [x] 5.7 Repository toolbar (debounced search with `?q=`, result count, include-subfolders toggle) and `SelectionBar` (N selected, Clear, Open in editor for exactly one)
- [x] 5.8 `/tests/[key].vue`: details card, read-only Gherkin card (add `#` comment styling and line numbers to `GherkinCode`), Back to repository preserving folder and `q`, loading/error/404 states, Open in Jira link
- [x] 5.9 Remove the US-08 detail modal and `RepositoryFolderNode`; confirm no `v-html` remains

## 6. Verification and docs

- [x] 6.1 Write `e2e/us-08-1-ui-redesign.spec.ts` covering every scenario in the specs: tokens in both themes and persistence, landing (signed out/in), `next` redirect and open-redirect refusal, login tabs and validation, API token never lingers, signed-in `/login` bounce, post-login destination, repository layout and keyboard tree, select-all, open test and back, unknown key, states, 375 px no horizontal overflow, safe rendering of markup-like text
- [x] 6.2 Add axe scans for landing, login, settings, repository, and test page in light and dark; add the zero `writeRequestCount` assertion at the end of the spec
- [x] 6.3 Run `pnpm check`, `pnpm test:unit tests/unit/ui`, `pnpm test:int tests/integration/route-guards.test.ts`, `pnpm test:int`, `pnpm test:e2e e2e/us-08-1-ui-redesign.spec.ts`, then the full `pnpm test:e2e`
- [x] 6.4 Update docs: ADR 0015 to `accepted`, `docs/architecture.md` routes, `docs/conventions.md` component layout and the `useUserSession().loggedIn` note, US-08/US-09 story files, progress entry
- [ ] 6.5 Activate US-08.1 in `feature-list.json` when implementation starts and commit `US-08.1: <summary>`; set `passing` only through `pnpm verify US-08.1`
