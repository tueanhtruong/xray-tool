## Context

See `proposal.md` for motivation and `specs/test-repository/spec.md` for behavior. The folder API already returns a nested tree whose nodes carry `remoteTestsCount`; the repository page currently renders that tree in a fixed 260 px grid column on desktop and stacks the sidebar above the main area below 800 px.

## Goals / Non-Goals

**Goals:**

- Derive inclusive folder counts from the existing tree without changing persistence or API contracts.
- Keep the desktop sidebar and main content in a stable, non-overlapping grid while the sidebar is resized.
- Make the disclosure state and resize control usable with keyboard and assistive technology.
- Retain the current narrow-screen stacked layout.

**Non-Goals:**

- Persisting a custom sidebar width across reloads; the page starts at 260 px.
- Changing folder/test count semantics in Xray, the database, or API responses.
- Adding a resize dependency or changing unrelated repository behaviors.

## Decisions

### Compute inclusive counts from the complete folder tree

Sum each folder's direct `remoteTestsCount` with the inclusive counts of all its child folders. Build the totals from the full nested input rather than visible rows so collapsing a folder cannot change its displayed total. Continue to show the direct count as the primary value and append the inclusive total only when it is larger, avoiding duplicate values on leaves or empty descendants.

Alternative considered: add an aggregate field to the folder API. This adds server response surface for a value that is a straightforward UI projection and is only needed in the folder tree, so it is not warranted.

### Resize the grid track with pointer and keyboard input

Use page state for the sidebar width and bind the desktop grid's first track to that value, with the second track allowed to shrink via `minmax(0, 1fr)`. Clamp all width updates to 150-500 px. A dedicated vertical separator will capture pointer movement during dragging and expose its orientation and value bounds; Left/Right keys will adjust the same state. Keep the separator outside the folder tree so resizing cannot accidentally select or expand a folder. The width resets to 260 px when the page is loaded again.

Alternative considered: resize the sidebar with a manually positioned overlay. A grid track keeps content layout and hit testing aligned and avoids layering the main area over the sidebar.

Below 800 px, retain the stacked layout and do not expose an active desktop resize separator.

### Enlarge the existing disclosure affordance

Increase the indicator's visual size and clickable area within each tree row while retaining the current tree keyboard behavior and expanded/collapsed semantics. Keep the count text separate from the disclosure control so the wider affordance does not change folder selection behavior.

Use local Lucide right and down chevrons for the collapsed and expanded states. Installing the Lucide icon collection lets Nuxt render icons from local data without a runtime network lookup. Keep the icon hidden for folders with no children.

Alternative considered: retain and enlarge the typographic glyph without adding an icon collection. A consistent icon better distinguishes tree disclosure from folder-name text and follows the repository's icon-based control convention.

## Risks / Trade-offs

- Xray folder counts can be stale until the next pull -> derive from the same cached direct counts already shown and update naturally after a successful pull; do not imply live remote counts.
- A resizer can reduce the main content area too far -> enforce both width bounds and use a shrinkable second grid track.
- Pointer dragging can interfere with text selection or touch scrolling -> use pointer capture only during a drag and scope touch-action suppression to the separator.
- An accessible separator can regress if its value is not updated with the grid -> keep the ARIA current value bound to the same clamped width state and verify with browser tests.

## Migration Plan

No data migration or rollout sequencing is required. The previous fixed 260 px layout remains the initial desktop state and can be restored by reverting the UI change.