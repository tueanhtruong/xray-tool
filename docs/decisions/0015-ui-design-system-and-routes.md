# 0015 — UI design system and route map

- Status: accepted
- Date: 2026-10-01
- Story: US-08.1

## Context

The screens built in US-00 → US-08 do not match the intended look. `refer/template` (an HTML prototype plus `UI-SPEC.md`) defines the target: tokens, a shared shell, and four screens (Landing, Login, Repository, Test case editor). The spec and the current app disagree in a few places, and the stories after US-08 build on whichever structure we pick now.

## Decision

- **UI kit**: keep Nuxt UI 4 + Tailwind v4 ([0002](0002-ui-kit-and-grid.md)). UI-SPEC says "no new UI library unless the repo already uses one"; it does. Template tokens (`--bg`, `--sf`, `--ink`, `--mute`, `--line`, `--brand`, `--soft`, `--ok`, `--warn`, `--bad`, `--add`, `--del`, `--code`) are CSS variables in `app/assets/css/main.css`, mapped onto Nuxt UI's semantic colors.
- **Dark mode**: Nuxt UI color mode (`.dark` class, system default, persisted choice) instead of the prototype's `[data-theme]` attribute. Same visual result, one mechanism.
- **Routes**: `/` becomes the public landing page; the current workspace-setup page moves to `/settings`; `/editor` is removed in favor of `/tests/:key` (single test) and the repository grid (multi-row editing, US-09/US-10). Protected pages (`/settings`, `/repository`, `/tests/*`) are guarded on the server and redirect to `/login?next=<path>`; `next` is accepted only as a same-origin relative path.
- **Folder deep link** stays `folder=<path>` (US-08 contract), not the template's numeric `folder=:id`.
- **List columns** are limited to key, summary, and folder. The template's Labels and Status columns need full details, which US-07 deliberately does not cache. They arrive with US-09's drafts/detail loading.
- **Editor selection**: "Open in editor" is enabled for one selected test and opens `/tests/:key` after the existing selection call; the multi-test `/editor?ids=` stub is dropped.
- **Sign-in return path**: `next` is validated by one pure `safeNextPath()` and carried through OAuth in a signed HttpOnly cookie; the default destination is `/repository` and the readiness guard forwards unready workspaces to `/settings`. API-token sign-in returns JSON `{ redirectTo }` instead of a 303.
- **Session detection in the UI**: `useUserSession().loggedIn` is unusable (ID-only session), so the UI checks `session.userId` and fetches `/api/auth/session` only when signed in.
- **Code editor**: CodeMirror 6 (UI-SPEC) is deferred to US-12; US-08.1 keeps the read-only `GherkinCode` component.

## Consequences

- Existing e2e specs and one integration assertion that expect `/` after sign-in or `/` as the not-ready redirect must be updated (`/settings`, `/repository`). Behavioral assertions stay the same.
- Bookmarks to `/` for workspace setup and `/editor` break; acceptable pre-release.
- US-09 depends on US-08.1 and implements its grid inside `/repository`, not a separate `/editor` page.
- If the landing page later needs a demo mode, add it in its own story; it is not in v1.
