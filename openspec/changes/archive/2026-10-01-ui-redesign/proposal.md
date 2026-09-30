## Why

US-00 to US-08 shipped working but unstyled screens: `/` is a long setup form, `/repository` is a raw table plus a modal, `/editor` is a stub, and `/repository` is not server-guarded. The XrayBulk design (`refer/template`) defines the look and page structure that US-09 to US-20 build on. Doing the visual and routing foundation once, before the editing stories, avoids restyling and re-routing every later screen.

## What Changes

- Add design tokens as CSS variables with light and dark values, mapped onto Nuxt UI's semantic colors; dark mode uses Nuxt UI color mode (system default, persisted override).
- Add a shared shell (`AppHeader`) and shared building blocks (`PageCard`, `StatusBadge`/`Chip`, `EmptyState`, `ErrorBanner`, `LoadingSkeleton`), with WCAG 2.1 AA behavior in both themes and stacked layouts below 800 px.
- **BREAKING**: `/` becomes a public landing page. The workspace setup page moves to `/settings`. `/editor` is removed. Bookmarks to either break.
- Guard `/settings`, `/repository`, and `/tests/*` on the server; unauthenticated requests redirect to `/login?next=<path>`. `next` is accepted only as a same-origin relative path and is carried through OAuth (signed cookie), site selection, and API-token sign-in.
- Post-login destination is `next`, else `/repository`; a workspace without a ready project is sent on to `/settings` by the existing readiness guard, which now redirects to `/settings` instead of `/`. A signed-in user opening `/login` is redirected.
- **BREAKING**: API-token sign-in returns JSON `{ redirectTo }` instead of a 303 redirect, so the client navigates explicitly.
- Redesign `/login` (tabs: Atlassian OAuth, Email + API token, client-side site-URL check), restyle site selection, and regroup `/settings` into cards without changing its behavior.
- Redesign `/repository` as a two-pane view (folder sidebar, toolbar, list, selection bar) limited to indexed fields (key, summary, folder). Replace the detail modal with a read-only `/tests/:key` page backed by a new `GET /api/tests/by-key/:key`. "Open in editor" is enabled for exactly one selected test and opens `/tests/:key` after the existing selection call.
- Mock services count write requests (non-GET Jira calls, GraphQL mutations) so end-to-end tests can assert that none occurred.
- Out of scope (reserved slots only): drafts, inline editing, labels/status columns, bulk actions, Gherkin editor, diff view, demo mode.

## Capabilities

### New Capabilities
- `ui-design-system`: Tokens, themes, shared shell and components, accessibility and responsive rules applying to every screen.
- `public-landing`: The static public landing page at `/` and its signed-in call-to-action variants.

### Modified Capabilities
- `jira-oauth-sign-in`: Protected pages (now including `/settings`, `/repository`, `/tests/*`) redirect with a safe `next`; `next` survives the OAuth round trip; signed-in users are bounced from `/login`; post-login destination rules.
- `jira-api-token-sign-in`: Login tabs and client-side site-URL check; submit returns JSON `{ redirectTo }`; token never lingers in client state or storage.
- `jira-project-selection`: Onboarding checklist lives at `/settings`; unready workspaces are redirected to `/settings` from repository pages.
- `test-repository`: Two-pane browse layout, `/tests/:key` read-only page with key lookup API and not-found state, single-test "Open in editor" replacing the `/editor?ids=` entry point, loading/error states.
- `mock-services`: Write-request counting and reset through the control endpoint.

## Impact

- Code: `app/` (new layout/components/pages, removal of `editor.vue`, `index.vue` → `settings.vue`), `server/middleware/01.auth.ts` and `02.project-ready.ts`, OAuth callback/select-site/api-token routes, `oauth-cookies.ts`, new `GET /api/tests/by-key/:key` plus a shared test-detail service extracted from the detail and selection routes, `shared/` (`safeNextPath`, API-token form validation, Jira issue URL helper), `packages/mock-services`.
- Tooling: `vue/no-v-html` raised from warning to error; shared `e2e/support` helpers; ESLint architecture test extended.
- Tests: ten e2e specs and four integration assertions updated for moved routes (`auth-oauth`, `jira-refresh`, `project-selection`); new `route-guards` integration test, `tests/unit/ui`, and `e2e/us-08-1-ui-redesign.spec.ts`.
- Docs: ADR 0015 accepted, `architecture.md`, `conventions.md`, story and progress updates.
- Dependencies: none added. No new Jira/Xray calls and no remote writes.
