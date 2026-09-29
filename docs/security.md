# Security

## Secrets

- Real secrets live **only** in `.env` (gitignored) locally and in GitHub Actions secrets for CI.
  `.env.example` holds placeholders and local-only dev defaults, never real values.
- Never put a secret (token, API key, client secret, JWT, cookie, encryption key) in:
  - source code, tests, fixtures, or mock responses
  - logs, error messages, or API responses (the health endpoint returns no error details)
  - client bundles: only `runtimeConfig.public` reaches the browser, and it holds no secrets
  - commit messages, docs, issue text, or chat with an agent. If a secret is pasted by mistake,
    rotate it.
- User-entered Atlassian/Xray credentials are stored encrypted at rest (AES-256-GCM, US-01) and
  never returned after they are saved.
- CI uses the mock target and needs **no** Atlassian or Xray secrets.

## Live testing: sandbox only

- `live` target development and `pnpm test:live` may only touch a **dedicated sandbox** Jira/Xray
  site and project (`SANDBOX_*` variables in `.env`), never a production site.
- Automated writes are namespaced, stay inside `SANDBOX_PROJECT_KEY`, and are cleaned up.
- Live responses copied into fixtures must be sanitized first (see [testing.md](testing.md#fixture-sanitization)).

## Local infrastructure

- The Postgres credentials in `docker-compose.yml` / `.env.example` (`xray`/`xray`) are local-only
  development defaults. They are not secrets and must not be reused anywhere else.
- Integration tests refuse to reset any database whose name doesn't end in `_test`.
