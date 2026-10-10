## 1. Preparation

- [x] 1.1 Confirm US-09 is synced to main specs and the US-09.1 draft requirements that mention labels and status are modified accordingly
- [x] 1.2 Take a database backup procedure note for the migration in the change's migration notes (no secrets)

## 2. Data model and migration

- [x] 2.1 Write a forward-only Prisma migration that deletes label- and status-only drafts, strips both fields from remaining drafts, and drops the columns from draft and baseline tables
- [x] 2.2 Bump the fingerprint version and recompute stored fingerprints from baseline data in the same migration
- [x] 2.3 Log the number of drafts deleted and changed from the migration
- [x] 2.4 Update `prisma/schema.prisma` to match the migration

## 3. Shared rules and fingerprint

- [x] 3.1 Restrict `shared/drafts/rules.ts` draft fields to summary and Gherkin, with no-op removal
- [x] 3.2 Exclude labels and status from `shared/fingerprint.ts`
- [x] 3.3 Remove label and status validation (including allowed-status checks) from draft rules

## 4. Draft API

- [x] 4.1 Reject `labels` and `status` in draft writes with HTTP 400 and error `unknown_field`
- [x] 4.2 Remove labels and status from draft and test-detail responses in `server/services/drafts.ts` and `server/services/test-details.ts`
- [x] 4.3 Add the key-set query for select-all across the active search and folder filter, with a response cap

## 5. Fixtures and mocks

- [x] 5.1 Remove labels and status from mock Xray/Jira fixtures and seed data where they only served drafts
- [x] 5.2 Remove the Xray/Jira requests that existed only to load labels and status

## 6. Repository grid

- [x] 6.1 Remove the Labels and Status columns, cells, header sort/filter and inline editors from the repository grid and `TestList.vue`
- [x] 6.2 Set the final column layout: Select, Key, Summary, Folder, Gherkin preview and Draft
- [x] 6.3 Apply the width rules: Summary minimum 280 px, Folder `clamp(120px, 14%, 200px)`, Gherkin flexible with minimum 320 px
- [x] 6.4 Implement the leaf-preserving folder trim as a pure function
- [x] 6.5 Show the folder tooltip only when trimmed, with `role="tooltip"`, `aria-describedby`, `tabindex="0"`, and a teleport
- [x] 6.6 Implement header select-all across the filter result and show "N selected"
- [x] 6.7 Keep the selection as a key set independent of virtualization and paging

## 7. Edit & Compare screen

- [x] 7.1 Add the selection store mirrored to `sessionStorage` scoped by project
- [x] 7.2 Add the **Edit all (N)** action, disabled when N is 0, navigating to `/tests/edit?project=<id>`
- [x] 7.3 Add the `/tests/edit` route with a redirect and notice when the store is empty
- [ ] 7.4 Build the left rail with virtualization, keyboard navigation (`Alt+Down`, `Alt+Up`) and `i / N`
- [x] 7.5 Build the header with the Summary input, folder with tooltip, back link and save state
- [x] 7.6 Load the CodeMirror 6 merge view client-only and lazily on this route
- [x] 7.7 Implement the live diff with debounced updates (150 ms), line numbers, filler lines, gutter markers and collapsible unchanged regions
- [x] 7.8 Implement per-hunk revert, **Revert test**, **Next change** and **Previous change**
- [x] 7.9 Implement autosave per test with `idle | saving | saved | error`, retry, and no lost keystrokes
- [x] 7.10 Set the draft pane disabled with a banner for read-only tests, and the empty state for tests without Gherkin
- [x] 7.11 Warn on navigation only when a save is in flight or has failed
- [x] 7.12 Remove a draft when its text returns to the baseline

## 8. Accessibility and performance

- [ ] 8.1 Verify keyboard reachability of every control and that the diff editor does not trap focus
- [ ] 8.2 Verify WCAG 2.1 AA contrast in light and dark themes
- [ ] 8.3 Verify the grid has no horizontal page scroll at 1280 px
- [ ] 8.4 Verify the rail and selection handle 500 selected tests
- [x] 8.5 Record the diff library choice as an ADR under `docs/decisions/`

## 9. Tests

- [x] 9.1 Update `tests/unit/draft-rules.test.ts` for summary and Gherkin only, no-op removal, and rejected labels and status
- [x] 9.2 Update `tests/unit/fingerprint.test.ts` for label and status exclusion and the version bump
- [x] 9.3 Add `tests/unit/folder-trim.test.ts` for leaf-preserving trim and untouched short paths
- [ ] 9.4 Add `tests/unit/line-diff.test.ts` for alignment, hunks and revert-hunk results
- [ ] 9.5 Update `tests/integration/drafts-api.test.ts` for the field contract and 400 on removed fields
- [ ] 9.6 Add `tests/integration/drafts-migration.test.ts` for the migration cases in the acceptance criteria
- [ ] 9.7 Add `e2e/us-09-1-edit-compare.spec.ts` for grid columns, tooltip, select, Edit all, typing, live diff, autosave, revert and back
- [x] 9.8 Update the US-09 e2e and unit tests that reference labels or status
- [ ] 9.9 Add an integration assertion that the mock services receive zero write requests during draft editing

## 10. Verification and documentation

- [ ] 10.1 Run `grep` for `labels` and `status` in draft code paths, schemas and fixtures and document any remaining legitimate uses
- [ ] 10.2 Run `pnpm check`
- [ ] 10.3 Run the unit and integration commands listed in the story
- [ ] 10.4 Run `pnpm test:e2e e2e/us-09-1-edit-compare.spec.ts`
- [ ] 10.5 Update the US-10, US-12, US-13/14, US-15 to US-19 story files as each starts, not in this change
- [ ] 10.6 Run `pnpm verify US-09.1` to set the story state; do not set it by hand
