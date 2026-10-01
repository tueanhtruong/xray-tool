## 1. Folder Tree Presentation

- [x] 1.1 Derive inclusive test totals from the full nested folder tree and show them beside direct counts only when descendants add tests.
- [x] 1.2 Replace the disclosure glyph with Lucide chevrons while preserving folder selection, expansion, and keyboard navigation behavior.
- [x] 1.3 Extend repository-browser coverage for collapsed parent totals, leaf count formatting, and disclosure state.

## 2. Resizable Desktop Sidebar

- [x] 2.1 Bind the desktop grid's sidebar track to page state, default it to 260 px, and clamp its width to 150-500 px.
- [x] 2.2 Add a pointer-draggable vertical separator with pointer capture, keyboard adjustment, accessible orientation/value bounds, and no active resize control below 800 px.
- [x] 2.3 Extend browser coverage for pointer resize limits, keyboard resizing, accessible separator values, and the narrow stacked layout.

## 3. Verification

- [x] 3.1 Run the repository-browser end-to-end tests and confirm the new folder count and resize scenarios pass.
- [x] 3.2 Run `pnpm check` and resolve any regressions introduced by the change.