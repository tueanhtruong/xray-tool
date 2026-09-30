// @ts-check
import prettier from 'eslint-config-prettier/flat'
import withNuxt from './.nuxt/eslint.config.mjs'

/**
 * Architecture guard (see docs/architecture.md).
 * Patterns use gitignore syntax: `**\/server/**` matches any path with a `server` segment,
 * and a leading `#` must be escaped (`\\#imports`) or it is read as a comment.
 */
const appRestrictions = {
  patterns: [
    {
      group: [
        '~~/server',
        '~~/server/**',
        '\\#server',
        '\\#server/**',
        '**/server/**',
        '**/server',
      ],
      message: 'app/ must not import server code. Call an API route with $fetch/useFetch instead.',
    },
    {
      group: [
        '@prisma/client',
        '@prisma/client/**',
        '**/generated/prisma',
        '**/generated/prisma/**',
      ],
      message: 'app/ must not import the Prisma client. Database access lives in server/.',
    },
  ],
}

const sharedRestrictions = {
  patterns: [
    {
      group: [
        '\\#imports',
        '\\#app',
        '\\#app/**',
        'nuxt',
        'nuxt/**',
        'nuxt*',
        '\\#internal/**',
        'nitropack',
        'nitropack/**',
        'nitropack*',
        'h3',
        'h3/**',
        'vue',
        'vue/**',
      ],
      message: 'shared/ must stay framework-free: no Nuxt, Nitro, h3 or Vue imports.',
    },
    {
      group: [
        '~~/server',
        '~~/server/**',
        '\\#server',
        '\\#server/**',
        '**/server/**',
        '**/server',
      ],
      message: 'shared/ must not import server code.',
    },
    {
      group: ['~', '~/**', '@', '@/**', '~~/app', '~~/app/**', '**/app/**', '**/app'],
      message: 'shared/ must not import UI code from app/.',
    },
  ],
}

export default withNuxt(
  {
    ignores: ['server/generated/**', 'refer/**', 'openspec/**', '.agents/**', '.opencode/**'],
  },
  {
    name: 'xray-tool/architecture/app',
    files: ['app/**/*.{js,mjs,ts,vue}'],
    rules: { 'no-restricted-imports': ['error', appRestrictions] },
  },
  {
    name: 'xray-tool/architecture/shared',
    files: ['shared/**/*.{js,mjs,ts}'],
    rules: { 'no-restricted-imports': ['error', sharedRestrictions] },
  },
  {
    // User and Jira/Xray content is rendered as text; raw HTML injection is an error.
    name: 'xray-tool/ui/no-v-html',
    files: ['app/**/*.vue'],
    rules: { 'vue/no-v-html': 'error' },
  },
  {
    // Server code logs through the structured logger (server/utils/logger.ts), which redacts
    // secrets. console.error/warn stay allowed for startup failures printed before it exists.
    name: 'xray-tool/server/no-console',
    files: ['server/**/*.{js,mjs,ts}'],
    rules: { 'no-console': ['error', { allow: ['error', 'warn'] }] },
  },
  prettier,
)
