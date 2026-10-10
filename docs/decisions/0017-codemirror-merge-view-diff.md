# 0017 — CodeMirror 6 merge view for the Edit & Compare diff

- Status: accepted
- Date: 2026-10-10
- Source: US-09.1 design decision 4 (openspec change `us-09-1-bulk-editor-rework`)

## Context

The Edit & Compare screen needs a side-by-side diff with filler lines, change gutters, collapsed unchanged regions, and per-change revert. Building aligned filler rows and per-hunk revert by hand is error-prone and would be an editor in itself.

## Decision

- Use `@codemirror/merge` (MergeView) with `@codemirror/view` and `@codemirror/state`.
- Load it client-only and lazily from `app/components/GherkinCompare.vue`, so it never enters the grid bundle.
- The baseline pane is read-only. Per-change revert uses MergeView's built-in `revertControls: 'a-to-b'`. Change navigation uses `goToNextChunk` and `goToPreviousChunk`.

## Alternatives considered

- Monaco Diff Editor: larger bundle, harder to keep out of the grid bundle.
- A hand-built two-pane diff: aligned filler rows and hunk revert would need to be maintained in-house.

## Consequences

- Three new runtime dependencies, all from the CodeMirror project.
- Gherkin syntax highlighting is not included. It belongs to US-12.
