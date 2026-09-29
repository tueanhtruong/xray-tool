# 0009 — TypeScript version

- Status: accepted
- Date: 2026-09-29
- Story: US-00

## Context

TypeScript 7.0 (the Go-native compiler) is npm `latest`. `vue-tsc` 3.3.11 declares
`typescript >=5.0.0`, but it relies on TypeScript's JavaScript language-service API.

## Spike (US-00, task 2.5)

Installed `typescript@7.0.2` + `vue-tsc@3.3.11` and ran `nuxt typecheck` on the skeleton:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/tsc' is not defined by "exports"
  in .../node_modules/typescript/package.json
    at resolveTscPath (.../vue-tsc/index.js:73:43)
```

TypeScript 7 no longer ships the JS `lib/tsc` entry that `vue-tsc` loads. Separately,
`typescript-eslint` 8.70 (used by `@nuxt/eslint`) declares a peer range of `>=4.8.4 <6.1.0`.

## Decision

Pin **`typescript@5.9.3`** exactly. With it, `nuxt typecheck` passes on the skeleton and the
typescript-eslint peer range is met.

## Consequences

- Revisit when `vue-tsc` and `typescript-eslint` support TypeScript 7. Re-run the same spike, then
  update this ADR.
