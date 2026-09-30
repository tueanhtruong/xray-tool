# UI Implementation Spec – XrayBulk (Vue 3)

Reference prototype: `index.html` (single file, Vue 3 global build, mock data). Open it in a browser and use the top-bar switcher to see all four screens. **Treat it as the visual and behavioral reference, not as code to copy.** Re-implement each screen as real Vue components in the existing app, following the repo's conventions and `stories.json`.

## 0. Ground rules

- Stack: Vue 3 + `<script setup lang="ts">`, the repo's existing router and store (Vue Router / Pinia if present). Do not add a UI library unless the repo already uses one.
- Replace all mock data in the prototype with calls to the app's own `/api/*` endpoints. The browser never receives Jira/Xray tokens or secrets.
- Edits are **local drafts only**. No screen in this spec writes to Xray or Jira. Remote writes happen only in the sync stories (US-18/19).
- Respect `stories.json`: WIP=1, only implement the story whose state is `active`; do not set `passing` by hand (`pnpm verify <id>` does that).
- Every screen needs loading, empty, and error states (the prototype only shows the happy path and one empty state).
- Accessibility: WCAG 2.1 AA. Labelled inputs, visible focus ring, keyboard-operable grid and tree, sufficient contrast in both themes, `aria-label` on icon-only buttons.

## 1. Design tokens

Define as CSS variables on `:root`, with a dark override under `prefers-color-scheme` and `[data-theme="dark"]`.

| Token | Light | Purpose |
|---|---|---|
| `--bg` | `#fafaf9` | page background |
| `--sf` | `#ffffff` | cards, table, sidebar |
| `--ink` / `--mute` | `#1c1917` / `#78716c` | text / secondary text |
| `--line` | `#e7e5e4` | borders |
| `--brand` / `--soft` | `#4f46e5` / `#eef2ff` | accent / accent tint (chips, selected rows) |
| `--ok` `--warn` `--bad` | green / amber / red | valid, draft dot, errors |
| `--add` / `--del` | light green / light red | diff lines |
| `--code` | `#f5f5f4` | code editor background |

Type: Inter / system sans, 14px base. Monospace for Gherkin and diff. Radius 8px controls, 12px cards. Breakpoint: below 800px, two-column layouts stack.

## 2. Shared shell (`AppHeader`)

Sticky top bar: logo (links to `/`), project name and breadcrumb (only when signed in), draft-count chip (`N drafts`, from the drafts store), theme toggle. The screen switcher in the prototype is a **demo-only control; do not implement it.** Use real routes.

| Route | Screen | Auth |
|---|---|---|
| `/` | Landing | public |
| `/login` | Login | public; redirect to `/repository` if already signed in |
| `/repository?folder=:id&q=:text` | Repository | required |
| `/tests/:key` | Test case editor | required |

Unauthenticated access to protected routes redirects to `/login?next=...`.

## 3. Landing (`/`) – US-00/US-02 entry

- Hero: badge "Jira + Xray Cloud", H1, one-line subtitle, primary CTA "Sign in with Jira" → `/login`, secondary "View demo" (optional; hide if no demo mode).
- Workflow pills: Pull → Edit drafts → Import .md → Review diff → Sync → Export.
- Six feature cards in a responsive grid (`minmax(230px,1fr)`): bulk grid, Gherkin editor, conflict-aware sync, Markdown import/export, secure by design, audit history.
- Static content only; no API calls.

## 4. Login (`/login`) – US-02, US-03

Centered card (max-width 420px) with two tabs:

**Atlassian OAuth (default)**: one full-width primary button "Continue with Atlassian" → full-page navigation to the server's OAuth start endpoint (state validated server-side). Helper text: tokens are encrypted and never sent to the browser. Show an error banner if the callback returns `?error=`.

**Email + API token (fallback)**: fields Jira site URL, Email, API token (`type=password`, `autocomplete="off"`). Client-side check that the URL matches `https://<site>.atlassian.net` and shows an inline error (server remains the authority, including SSRF protection). Submit "Verify & connect" is disabled until all fields are valid; on submit, POST to the API-token endpoint, show a spinner, and map server errors (invalid credentials, unreachable site) to inline messages. Clear the token field from state after submit.

After success: go to project selection (US-05) if no project is stored, otherwise `/repository`.

## 5. Repository (`/repository`) – US-06, US-07, US-08, US-09, US-10

Layout: two columns (260px folder sidebar + main).

**Sidebar (`FolderTree`)**: indented folder rows with test counts, selected row highlighted with `--soft`/`--brand`. "All tests" is the root. Selecting a folder includes its descendants. A "Pull from Xray" button triggers the pull and shows progress; disable while a pull runs (concurrent pulls are rejected, US-06). Keyboard: arrow keys to move, Enter to select. Folder ID is stored in the query string for deep links.

**Toolbar**: search input (key or summary, debounced, stored in `?q=`), result count, primary button "Review N changes" (disabled when N=0; navigates to the review page in US-16).

**Bulk bar** (visible when ≥1 row selected): "N selected", `+ Label`, `Set status…` dropdown, `Find & replace`, `Clear`. Actions create drafts for the selection only, with a preview and a single-step undo (US-10). Find & replace must use the ReDoS-safe implementation.

**Grid (`TestGrid`)**: columns Select, Key, Summary, Labels, Status.
- Key is a link to `/tests/:key`; a warning dot precedes keys that have a local draft.
- Summary is an inline text input; labels render as chips; status is a select (Draft, In Review, Approved, Deprecated; load the real values from Xray/Jira config).
- Edits autosave as server-side drafts (debounced). If an edit returns a value to the original, the draft is removed (no-op rule).
- Virtualize rows (the prototype renders all rows; real data is large). The header checkbox selects all visible rows.
- Footer note: "Edits are saved as local drafts. Nothing is written to Xray until you review and sync."
- The list shows only lightweight fields (key, name, folder). Full details load when a row is opened or selected for editing (US-07/US-08).

## 6. Test case editor (`/tests/:key`) – US-09, US-11, US-12

Two columns (300px details + flexible editor), stacking on mobile.

**Left card**: back link to the repository (preserve folder and search query), key, Summary input, Status select, Labels (chips removable by click with an `×`; add-label input commits on Enter and ignores duplicates), buttons `Undo all` (disabled when clean) and `Add to review` (disabled while Gherkin has errors), plus a draft indicator: "Draft autosaved" or "No local changes".

**Right card: Gherkin steps**: segmented control `Edit | Compare with Xray`.
- *Edit*: code editor with line numbers, keyword highlighting (Feature, Scenario, Scenario Outline, Background, Examples, Given/When/Then/And/But), `@tags`, `#` comments, and completion for keywords. The prototype overlays a transparent `<textarea>` on a highlighted `<pre>`; use CodeMirror 6 (or the repo's existing editor) in the real app instead.
- *Compare with Xray*: line diff of the current Xray version vs the local draft; added lines on `--add`, removed lines on `--del`. Use the shared diff engine (US-15), not the prototype's simple line-set logic.
- Validation strip under the editor: green "Valid Gherkin" or a red count with `Line N: message` entries. Use the real parser from US-11, not the prototype's regex linter. Clicking an error should move the cursor to that line.
- Autosave the draft; detect when the remote test changed since the snapshot and show the conflict flow from US-17 rather than silently overwriting.

## 7. Data shapes (TypeScript, adjust to the real API)

```ts
type TestStatus = 'Draft' | 'In Review' | 'Approved' | 'Deprecated'
interface TestListItem { key: string; name: string; folderId: number; hasDraft: boolean }
interface TestDetail extends TestListItem { labels: string[]; status: TestStatus; gherkin: string }
interface Draft { key: string; name?: string; labels?: string[]; status?: TestStatus; gherkin?: string; baseFingerprint: string }
interface FolderNode { id: number; name: string; parentId: number | null; testCount: number }
```

## 8. Acceptance checklist

1. All four routes render and match the prototype layout in light and dark themes and at 375px width.
2. Login works with both methods; no token appears in browser storage, network responses, or logs.
3. Folder selection, search, and deep links round-trip through the URL.
4. Inline edits, bulk actions, and the editor all create or clear drafts without any remote write.
5. Invalid Gherkin disables "Add to review" and shows located errors.
6. Loading, empty, and error states exist for every screen; keyboard-only use is possible.
7. The story's `verification` commands in `stories.json` pass (`pnpm check`, relevant `test:int` and `test:e2e`).

## 9. Suggested prompt for the agent

> Read `UI-SPEC.md` and open `index.html` as the visual reference. Implement only the story currently `active` in `stories.json`, reusing the existing router/store and API layer. Build the screens as Vue SFCs (`<script setup lang="ts">`), use real API calls in place of the prototype's mock data, and do not copy the prototype's demo switcher, regex linter, or textarea-overlay editor. Run the story's verification commands and report results; do not edit story state manually.
