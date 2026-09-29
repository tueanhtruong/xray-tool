import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT, parseArgs, verifyStory } from '../../scripts/verify-story.mjs'

interface Story {
  id: string
  dependsOn: string[]
  verification: string[]
  state: string
  evidence: unknown
}

const SHA = '0123456789abcdef0123456789abcdef01234567'

function story(id: string, overrides: Partial<Story> = {}): Story {
  return {
    id,
    dependsOn: [],
    verification: ['pnpm check', 'pnpm test:int'],
    state: 'not_started',
    evidence: null,
    ...overrides,
  }
}

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'verify-story-'))
  file = join(dir, 'feature-list.json')
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function writeFixture(stories: Story[]) {
  const text = `${JSON.stringify({ rules: { wipLimit: 1 }, stories }, null, 2)}\n`
  await writeFile(file, text)
  return text
}

function harness(
  opts: {
    head?: string | null
    dirtyBefore?: string[]
    dirtyAfter?: string[]
    codes?: number[]
  } = {},
) {
  const ran: { cmd: string; env: NodeJS.ProcessEnv }[] = []
  const codes = [...(opts.codes ?? [])]
  let calls = 0
  const logs: string[] = []
  return {
    ran,
    logs,
    deps: {
      file,
      run: vi.fn(async (cmd: string, env: NodeJS.ProcessEnv) => {
        ran.push({ cmd, env })
        return codes.shift() ?? 0
      }),
      git: {
        headSha: () => (opts.head === undefined ? SHA : opts.head),
        changedFiles: () => (calls++ === 0 ? (opts.dirtyBefore ?? []) : (opts.dirtyAfter ?? [])),
      },
      log: (m: string) => logs.push(m),
      error: (m: string) => logs.push(m),
      now: () => new Date('2026-09-29T10:00:00.000Z'),
      env: {},
    },
  }
}

describe('verifyStory preconditions', () => {
  it('refuses an unknown story', async () => {
    const original = await writeFixture([story('US-00', { state: 'active' })])
    const h = harness()
    expect(await verifyStory({ id: 'US-99', ...h.deps })).toBe(EXIT.PRECONDITION)
    expect(h.ran).toEqual([])
    expect(await readFile(file, 'utf8')).toBe(original)
  })

  it('refuses a story that is not active and says how to activate it', async () => {
    const original = await writeFixture([story('US-00')])
    const h = harness()
    expect(await verifyStory({ id: 'US-00', ...h.deps })).toBe(EXIT.PRECONDITION)
    expect(h.ran).toEqual([])
    expect(h.logs.join('\n')).toMatch(/must be "active" first/)
    expect(await readFile(file, 'utf8')).toBe(original)
  })

  it('refuses when a dependency is not passing and lists it', async () => {
    await writeFixture([
      story('US-00', { state: 'active' }),
      story('US-01', { state: 'active', dependsOn: ['US-00'] }),
    ])
    const h = harness()
    expect(await verifyStory({ id: 'US-01', ...h.deps })).toBe(EXIT.PRECONDITION)
    expect(h.ran).toEqual([])
    expect(h.logs.join('\n')).toMatch(/not passing: US-00/)
  })

  it('refuses when the repository has no commit', async () => {
    await writeFixture([story('US-00', { state: 'active' })])
    const h = harness({ head: null })
    expect(await verifyStory({ id: 'US-00', ...h.deps })).toBe(EXIT.PRECONDITION)
    expect(h.ran).toEqual([])
    expect(h.logs.join('\n')).toMatch(/no commit/)
  })

  it('refuses on a dirty working tree and asks to commit first', async () => {
    const original = await writeFixture([story('US-00', { state: 'active' })])
    const h = harness({ dirtyBefore: ['app/pages/index.vue'] })
    expect(await verifyStory({ id: 'US-00', ...h.deps })).toBe(EXIT.PRECONDITION)
    expect(h.ran).toEqual([])
    expect(h.logs.join('\n')).toMatch(/Commit first/)
    expect(h.logs.join('\n')).toContain('app/pages/index.vue')
    expect(await readFile(file, 'utf8')).toBe(original)
  })

  it('refuses a story that is already passing and changes nothing', async () => {
    const original = await writeFixture([
      story('US-00', { state: 'passing', evidence: { commit: 'abc' } }),
    ])
    const h = harness()
    expect(await verifyStory({ id: 'US-00', ...h.deps })).toBe(EXIT.PRECONDITION)
    expect(h.ran).toEqual([])
    expect(h.logs.join('\n')).toMatch(/already passing/)
    expect(await readFile(file, 'utf8')).toBe(original)
  })
})

describe('verifyStory execution', () => {
  it('stops at the first failing command, reports it, and leaves the file unchanged', async () => {
    const original = await writeFixture([
      story('US-00', { state: 'active', verification: ['a', 'b', 'c'] }),
    ])
    const h = harness({ codes: [0, 3, 0] })
    expect(await verifyStory({ id: 'US-00', ...h.deps })).toBe(EXIT.FAILED)
    expect(h.ran.map((r) => r.cmd)).toEqual(['a', 'b'])
    expect(h.logs.join('\n')).toContain('✗ b failed (exit 3)')
    expect(await readFile(file, 'utf8')).toBe(original)
  })

  it('runs every command with NUXT_INTEGRATION_TARGET=mock', async () => {
    await writeFixture([story('US-00', { state: 'active' })])
    const h = harness()
    await verifyStory({ id: 'US-00', ...h.deps, env: { NUXT_INTEGRATION_TARGET: 'live' } })
    expect(h.ran.every((r) => r.env.NUXT_INTEGRATION_TARGET === 'mock')).toBe(true)
  })

  it('on success writes passing + evidence with the HEAD SHA and touches no other story', async () => {
    await writeFixture([
      story('US-00', { state: 'active' }),
      story('US-01', { dependsOn: ['US-00'] }),
    ])
    const h = harness()
    expect(await verifyStory({ id: 'US-00', ...h.deps })).toBe(EXIT.OK)

    const text = await readFile(file, 'utf8')
    expect(text.endsWith('}\n')).toBe(true)
    const data = JSON.parse(text) as { stories: Story[] }
    const [us00, us01] = data.stories
    expect(us00?.state).toBe('passing')
    expect(us00?.evidence).toEqual({
      commit: SHA,
      verifiedAt: '2026-09-29T10:00:00.000Z',
      integrationTarget: 'mock',
      commands: [
        { cmd: 'pnpm check', durationMs: expect.any(Number) },
        { cmd: 'pnpm test:int', durationMs: expect.any(Number) },
      ],
    })
    expect(us01).toEqual(story('US-01', { dependsOn: ['US-00'] }))
    expect(h.logs.join('\n')).toMatch(/Commit this change/)
  })

  it('does not mark passing when commands modified tracked files, and names them', async () => {
    const original = await writeFixture([story('US-00', { state: 'active' })])
    const h = harness({ dirtyAfter: ['pnpm-lock.yaml'] })
    expect(await verifyStory({ id: 'US-00', ...h.deps })).toBe(EXIT.FAILED)
    expect(h.logs.join('\n')).toContain('pnpm-lock.yaml')
    expect(await readFile(file, 'utf8')).toBe(original)
  })
})

describe('parseArgs', () => {
  it('reads the id and an optional --file', () => {
    expect(parseArgs(['US-03'])).toEqual({
      id: 'US-03',
      file: 'docs/user-stories/feature-list.json',
    })
    expect(parseArgs(['US-03', '--file', 'x.json'])).toEqual({ id: 'US-03', file: 'x.json' })
    expect(parseArgs(['--file=y.json', 'US-04'])).toEqual({ id: 'US-04', file: 'y.json' })
  })
})
