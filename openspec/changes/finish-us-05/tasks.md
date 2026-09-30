## 1. Resolve persistence shape and add migrations

- [x] 1.1 Compare the planned US-06 folder cache, US-07 test cache, and US-09 draft ownership models; choose the smallest compatible workspace/project-scoped persistence shape that supports US-05 draft detection and cache cleanup without implementing those stories' workflows.
- [x] 1.2 Add Prisma models and an additive migration for the selected cache ownership and persisted pending-draft foundations; verify existing workspaces and project selections need no synthetic rows or backfill.

## 2. Enforce project-switch safeguards

- [x] 2.1 Replace the placeholder draft guard with a persisted, workspace-scoped pending-draft query that can run in the project-selection transaction and safely serialize against draft creation.
- [x] 2.2 Implement old-project cache cleanup using workspace and prior project identity, and invoke it in the same transaction as the selected-project update only when replacing an existing project.
- [x] 2.3 Preserve the prior selection and cache on draft rejection, failed readiness probes, unconfirmed switching, and transaction failure; ensure first selection does not delete unrelated workspace data.

## 3. Verify isolation and user-visible behavior

- [x] 3.1 Extend project-selection integration tests to cover persisted-draft blocking, no-draft replacement, old-project cache cleanup, cross-workspace isolation, first selection, and preservation after probe or persistence failure.
- [x] 3.2 Extend US-05 E2E coverage for change confirmation and the actionable pending-draft block message while confirming the previously selected project remains ready.
- [x] 3.3 Run `pnpm check`, `pnpm test:int tests/integration/project-selection.test.ts`, and `pnpm test:e2e e2e/us-05-project-selection.spec.ts` on the mock target; resolve failures before story verification.

## 4. Reconcile story and architecture records

- [x] 4.1 Update architecture/integration documentation with the agreed workspace/project ownership and cleanup extension contract for US-06, US-07, and US-09.
- [x] 4.2 Update US-05's state and progress entry to reflect implementation and verification status; do not mark the story passing manually—run `pnpm verify US-05` after the implementation is committed.
