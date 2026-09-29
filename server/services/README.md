# server/services

Domain logic. Handlers in `server/api/` stay thin and call into here.

- May import: `shared/`, `server/integrations/`, `server/utils/`.
- Must not import: `app/`.

See [docs/architecture.md](../../docs/architecture.md).
