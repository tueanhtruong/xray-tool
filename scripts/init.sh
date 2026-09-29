#!/usr/bin/env bash
# Idempotent bootstrap: fresh clone -> working app + database.
#   cp .env.example .env && ./scripts/init.sh
# Safe to re-run: nothing is dropped, reset, or recreated. Does NOT start the
# mock services (run `pnpm mock` separately when you need them).
set -euo pipefail

cd "$(dirname "$0")/.."

CI="${CI:-false}"
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; }

# --- Prerequisites ------------------------------------------------------------
step "Checking prerequisites"
problems=0

required_node="$(tr -d '[:space:]v' < .nvmrc)"
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not installed. Fix: nvm install ${required_node} && nvm use ${required_node}"
  problems=$((problems + 1))
else
  current_node="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "${current_node}" != "${required_node}" ]]; then
    fail "Node ${required_node} is required (.nvmrc), but Node ${current_node} is active. Fix: nvm install ${required_node} && nvm use ${required_node}"
    problems=$((problems + 1))
  fi
fi

pnpm_version="$(sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' package.json)"
if ! command -v pnpm >/dev/null 2>&1; then
  fail "pnpm is not installed. Fix: npm install -g pnpm@${pnpm_version}"
  problems=$((problems + 1))
fi

if [[ "${CI}" != "true" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    fail "Docker is not installed. Fix: install Docker Desktop (https://docs.docker.com/get-docker/)"
    problems=$((problems + 1))
  elif ! docker info >/dev/null 2>&1; then
    fail "The Docker daemon is not running. Fix: start Docker Desktop (or run: open -a Docker)"
    problems=$((problems + 1))
  fi
fi

if [[ ! -f .env ]]; then
  fail ".env is missing. Fix: cp .env.example .env"
  problems=$((problems + 1))
fi

if (( problems > 0 )); then
  printf '\n%d prerequisite(s) missing; fix them and re-run ./scripts/init.sh\n' "${problems}" >&2
  exit 1
fi
echo "Node $(node -v), pnpm $(pnpm -v), .env present"

# --- Encryption key -----------------------------------------------------------
# NUXT_ENCRYPTION_KEY protects credentials stored in the database (docs/security.md).
# Generate a local one when it is missing or empty; never overwrite an existing value.
# The key is written to .env (gitignored) and is never printed.
step "Ensuring NUXT_ENCRYPTION_KEY is set in .env"
if grep -Eq '^NUXT_ENCRYPTION_KEY=("")?[[:space:]]*$' .env; then
  new_key="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")"
  awk -v key="${new_key}" '/^NUXT_ENCRYPTION_KEY=("")?[[:space:]]*$/ { print "NUXT_ENCRYPTION_KEY=" key; next } { print }' .env > .env.tmp
  cat .env.tmp > .env
  rm -f .env.tmp
  echo "Generated a new NUXT_ENCRYPTION_KEY in .env"
elif grep -Eq '^NUXT_ENCRYPTION_KEY=' .env; then
  echo "NUXT_ENCRYPTION_KEY already set; leaving it unchanged"
else
  new_key="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")"
  printf '\nNUXT_ENCRYPTION_KEY=%s\n' "${new_key}" >> .env
  echo "Added NUXT_ENCRYPTION_KEY to .env"
fi

# --- Bootstrap ----------------------------------------------------------------
step "Installing dependencies"
pnpm install --frozen-lockfile

if [[ "${CI}" == "true" ]]; then
  step "Postgres: using the CI service container (docker compose skipped)"
else
  step "Starting Postgres (docker compose)"
  docker compose up -d --wait postgres
fi

step "Ensuring the test database exists"
node scripts/ensure-test-db.mjs

step "Generating the Prisma client"
pnpm exec prisma generate

step "Applying migrations to the development database"
pnpm exec prisma migrate deploy

step "Installing the Playwright browser (chromium)"
if [[ "${CI}" == "true" ]]; then
  pnpm exec playwright install --with-deps chromium
else
  pnpm exec playwright install chromium
fi

# --- Summary ------------------------------------------------------------------
cat <<'EOF'

✓ Bootstrap complete.

Next:
  pnpm dev          # app on http://localhost:3000 (health: /api/health)
  pnpm check        # lint, typecheck, unit tests, build
  pnpm test:int     # integration tests (test DB)
  pnpm test:e2e     # Playwright (needs a build: pnpm build)
  pnpm mock         # mock Atlassian/Jira/Xray on :4010 (not started by init)
EOF
