import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

let eslint: ESLint

beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() })
})

async function restrictedImports(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports')
}

describe('architecture guard: app/', () => {
  const file = 'app/composables/guard-sample.ts'

  it.each([
    "import { usePrisma } from '~~/server/utils/prisma'",
    "import { usePrisma } from '../../server/utils/prisma'",
    "import { PrismaClient } from '~~/server/generated/prisma/client'",
    "import { PrismaClient } from '@prisma/client'",
  ])('rejects %s', async (line) => {
    const messages = await restrictedImports(file, `${line}\nexport const x = 1\n`)
    expect(messages.length).toBeGreaterThan(0)
    for (const m of messages) expect(m.message).toMatch(/app\/ must not import/)
  })

  it('allows importing shared code', async () => {
    const messages = await restrictedImports(
      file,
      "import { configSchema } from '~~/shared/config/schema'\nexport const x = configSchema\n",
    )
    expect(messages).toEqual([])
  })
})

describe('architecture guard: shared/', () => {
  const file = 'shared/utils/guard-sample.ts'

  it.each([
    "import { useRuntimeConfig } from '#imports'",
    "import { defineNuxtConfig } from 'nuxt/config'",
    "import { useNuxtApp } from '#app'",
    "import { useRuntimeConfig } from '#internal/nitro'",
    "import { defineNitroConfig } from 'nitropack/config'",
    "import { defineEventHandler } from 'h3'",
    "import { ref } from 'vue'",
    "import { usePrisma } from '../../server/utils/prisma'",
    "import Page from '~/pages/index.vue'",
    "import Page from '../../app/pages/index.vue'",
  ])('rejects %s', async (line) => {
    const messages = await restrictedImports(file, `${line}\nexport const x = 1\n`)
    expect(messages.length).toBeGreaterThan(0)
    for (const m of messages) expect(m.message).toMatch(/shared\/ must/)
  })

  it('allows pure libraries and sibling shared modules', async () => {
    const messages = await restrictedImports(
      file,
      "import { z } from 'zod'\nimport { configSchema } from '../config/schema'\nexport const x = [z, configSchema]\n",
    )
    expect(messages).toEqual([])
  })
})

describe('no console output in server code', () => {
  const file = 'server/utils/console-guard-sample.ts'

  async function consoleMessages(code: string) {
    const [result] = await eslint.lintText(code, { filePath: file })
    return (result?.messages ?? []).filter((m) => m.ruleId === 'no-console')
  }

  it.each(['log', 'info', 'debug', 'dir'])('rejects console.%s', async (method) => {
    const messages = await consoleMessages(`console.${method}('x')\nexport const x = 1\n`)
    expect(messages.length).toBeGreaterThan(0)
  })

  it.each(['error', 'warn'])('allows console.%s for startup failure output', async (method) => {
    expect(await consoleMessages(`console.${method}('x')\nexport const x = 1\n`)).toEqual([])
  })

  it('does not apply outside server/', async () => {
    const [result] = await eslint.lintText("console.log('x')\nexport const x = 1\n", {
      filePath: 'shared/utils/console-guard-sample.ts',
    })
    expect((result?.messages ?? []).filter((m) => m.ruleId === 'no-console')).toEqual([])
  })
})
