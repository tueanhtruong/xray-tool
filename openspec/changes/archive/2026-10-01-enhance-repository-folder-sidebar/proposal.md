## Why

The repository folder tree shows only each folder's direct test count, making it difficult to understand the full amount of work beneath a parent folder. Its fixed-width sidebar can also truncate folder names, while the small disclosure indicator is difficult to spot.

## What Changes

- Replace the typographic folder disclosure glyph with local Lucide chevron icons while preserving the tree's existing keyboard behavior.
- Show each folder's direct test count and, when descendant folders add tests, its inclusive subtree total (for example, `Archived 2 (9)`).
- Allow the desktop sidebar width to be resized by dragging, constrained to 150–500 px, while retaining the existing stacked layout on narrow screens.
- Provide an accessible resize separator with keyboard controls and current/minimum/maximum values.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `test-repository`: clarify folder counts, improve disclosure visibility, and make the repository sidebar resizable.

## Impact

- UI: `app/components/FolderTree.vue` and `app/pages/repository.vue`; the Lucide collection is installed locally for offline icon rendering.
- Verification: repository-browser end-to-end coverage for subtree counts, disclosure behavior, and resize bounds/accessibility.
- No API or database changes are expected; subtree totals can be derived from the cached nested folder tree.