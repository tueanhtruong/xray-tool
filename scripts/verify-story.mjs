#!/usr/bin/env node
// pnpm verify <US-ID> [--file <feature-list.json>]
//
// The only way a story becomes `passing`. Refuses to run unless the story is
// `active`, every dependency is `passing`, HEAD exists and the working tree is
// clean. Runs the story's `verification` commands in order against the mock
// integration target; on full success records evidence. See docs/testing.md.
import { spawn, spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_FILE = 'docs/user-stories/feature-list.json'
export const INTEGRATION_TARGET = 'mock'

/** Exit codes: 0 passing, 1 a command failed / tree changed, 2 preconditions not met. */
export const EXIT = { OK: 0, FAILED: 1, PRECONDITION: 2 }

/** Run a shell command with inherited stdio; resolves to its exit code. */
export function runCommand(cmd, env) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, { shell: true, stdio: 'inherit', env })
    child.on('error', () => resolvePromise(127))
    child.on('exit', (code, signal) => resolvePromise(code ?? (signal ? 128 : 1)))
  })
}

export function createGit(cwd = process.cwd()) {
  const git = (args) => spawnSync('git', args, { cwd, encoding: 'utf8' })
  return {
    headSha() {
      const r = git(['rev-parse', '--verify', '--quiet', 'HEAD'])
      return r.status === 0 ? r.stdout.trim() : null
    },
    changedFiles() {
      const r = git(['status', '--porcelain'])
      if (r.status !== 0) throw new Error(`git status failed: ${r.stderr}`)
      return r.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3))
    },
  }
}

/** Serialize like the committed file: 2-space JSON, Prettier style, trailing newline. */
async function serialize(data, file) {
  const json = `${JSON.stringify(data, null, 2)}\n`
  try {
    const prettier = await import('prettier')
    const options = (await prettier.resolveConfig(file)) ?? {}
    return await prettier.format(json, { ...options, parser: 'json' })
  } catch {
    return json
  }
}

export function parseArgs(argv) {
  const args = { id: undefined, file: DEFAULT_FILE }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--file') args.file = argv[++i]
    else if (arg.startsWith('--file=')) args.file = arg.slice('--file='.length)
    else if (!args.id) args.id = arg
  }
  return args
}

/**
 * Core gate. All side effects are injectable so tests can use fixtures:
 * `run(cmd, env) -> exitCode`, `git.headSha()`, `git.changedFiles()`.
 * Returns the process exit code.
 */
export async function verifyStory({
  id,
  file = DEFAULT_FILE,
  run = runCommand,
  git = createGit(),
  log = console.log,
  error = console.error,
  now = () => new Date(),
  env = process.env,
}) {
  const refuse = (message) => {
    error(`✗ ${message}`)
    error('No verification command was run and feature-list.json was not changed.')
    return EXIT.PRECONDITION
  }

  if (!id) return refuse('Usage: pnpm verify <US-ID> [--file <path>]')

  let data
  try {
    data = JSON.parse(await readFile(file, 'utf8'))
  } catch (e) {
    return refuse(`Cannot read ${file}: ${e.message}`)
  }
  const stories = Array.isArray(data.stories) ? data.stories : []
  const story = stories.find((s) => s.id === id)

  if (!story) return refuse(`Story ${id} is not in ${file}.`)
  if (story.state === 'passing') {
    return refuse(`${id} is already passing; passing is irreversible via verify.`)
  }
  if (story.state !== 'active') {
    return refuse(
      `${id} is "${story.state}" but must be "active" first. ` +
        `Set "state": "active" for ${id} in ${file} (WIP = 1: no other story may be active).`,
    )
  }

  const blockers = (story.dependsOn ?? []).filter(
    (dep) => stories.find((s) => s.id === dep)?.state !== 'passing',
  )
  if (blockers.length > 0) {
    return refuse(`${id} depends on stories that are not passing: ${blockers.join(', ')}.`)
  }

  const commit = git.headSha()
  if (!commit) return refuse('The repository has no commit yet. Commit your work first.')

  const dirty = git.changedFiles()
  if (dirty.length > 0) {
    return refuse(
      `The working tree has uncommitted changes. Commit first (git add -A && git commit -m "${id}: ...").\n` +
        dirty.map((f) => `    ${f}`).join('\n'),
    )
  }

  const commands = story.verification ?? []
  if (commands.length === 0) return refuse(`${id} has no verification commands.`)

  const runEnv = { ...env, NUXT_INTEGRATION_TARGET: INTEGRATION_TARGET }
  const results = []
  for (const [index, cmd] of commands.entries()) {
    log(`\n▶ [${index + 1}/${commands.length}] ${cmd}`)
    const started = Date.now()
    const code = await run(cmd, runEnv)
    const durationMs = Date.now() - started
    if (code !== 0) {
      error(`\n✗ ${cmd} failed (exit ${code})`)
      error(`${id} stays "${story.state}"; ${file} was not changed.`)
      return EXIT.FAILED
    }
    log(`✓ ${cmd} (${durationMs} ms)`)
    results.push({ cmd, durationMs })
  }

  const changed = git.changedFiles()
  if (changed.length > 0) {
    error('\n✗ Verification commands modified the working tree; not marking passing:')
    for (const f of changed) error(`    ${f}`)
    error(
      'Commands must not change tracked files. Fix the cause (or commit the change) and re-run.',
    )
    return EXIT.FAILED
  }

  story.state = 'passing'
  story.evidence = {
    commit,
    verifiedAt: now().toISOString(),
    integrationTarget: INTEGRATION_TARGET,
    commands: results,
  }
  await writeFile(file, await serialize(data, file))

  log(`\n✓ ${id} is now passing (verified commit ${commit.slice(0, 12)}).`)
  log(`Commit this change: git add ${file} && git commit -m "${id}: mark passing"`)
  return EXIT.OK
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { id, file } = parseArgs(process.argv.slice(2))
  process.exitCode = await verifyStory({ id, file })
}
