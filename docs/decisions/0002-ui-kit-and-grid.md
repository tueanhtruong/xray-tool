# 0002 — UI kit and grid

- Status: accepted
- Date: 2026-09-29
- Story: US-00 (grid used from US-08/US-09)

## Context

The core screen is a spreadsheet-like bulk editor over potentially thousands of test cases. It
needs a component kit for forms, dialogs, and navigation, and a grid with row selection,
inline editing, and virtualization.

## Decision

- **UI kit: Nuxt UI 4** (`@nuxt/ui`, Tailwind CSS v4). It is the first-party Nuxt kit, and it
  bundles icons, color mode, and accessible primitives (Reka UI).
- **Grid: TanStack Table + TanStack Virtual.** Nuxt UI's `UTable` is built on TanStack Table
  and supports virtualization with TanStack Virtual, so "Nuxt UI + TanStack" is one choice.
- US-00 installs only `@nuxt/ui` (plus `tailwindcss`, which pnpm needs as a direct dependency).
  `@tanstack/vue-table` / `@tanstack/vue-virtual` are added directly in US-09 only if the grid
  outgrows `UTable`.

## Consequences

- Styling is Tailwind utility classes plus Nuxt UI theme tokens; no second CSS framework.
- If `UTable` limits inline editing, US-09 drops down to headless TanStack Table and keeps Nuxt UI
  for cells and controls.
