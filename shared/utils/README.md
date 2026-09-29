# shared/utils

Pure TypeScript helpers usable from both `app/` and `server/`.

- No imports from `#imports`, `#app`, `nuxt`, `#internal/*`, `nitropack`, `h3`, `vue`, `server/` or `app/`
  (enforced by ESLint, see `eslint.config.mjs`).
- Unit-test everything here under `tests/unit/`.

See [docs/architecture.md](../../docs/architecture.md).
