import { randomUUID } from 'node:crypto'
import { getXrayProjectFolders, getXrayTestsPage } from '../integrations/xray/client'
import { logger } from '../utils/logger'
import { requireWorkspaceProject } from './project-selection'

export interface PullJob {
  id: string
  workspaceId: string
  projectId: string
  state: 'running' | 'succeeded' | 'failed'
  fetched: number
  total: number | null
  folders: number | null
  message?: string
  requestId?: string
  startedAt: string
  finishedAt?: string
  kind: 'folders' | 'full'
}

const jobs = new Map<string, PullJob>()
const activeJobs = new Map<string, string>()

export class PullJobError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message)
    this.name = 'PullJobError'
  }
}

export function getPullJob(workspaceId: string): PullJob | undefined {
  const activeId = activeJobs.get(workspaceId)
  const id = activeId && activeId !== 'starting'
    ? activeId
    : [...jobs.values()].findLast((job) => job.workspaceId === workspaceId)?.id
  const job = id ? jobs.get(id) : undefined
  return job ? { ...job } : undefined
}

export function reservePull(workspaceId: string): void {
  if (activeJobs.has(workspaceId)) throw new PullJobError('A pull is already running', 409)
  activeJobs.set(workspaceId, 'starting')
}

export function releasePullReservation(workspaceId: string): void {
  if (activeJobs.get(workspaceId) === 'starting') activeJobs.delete(workspaceId)
}

export async function startFolderPull(workspaceId: string, requestId?: string): Promise<PullJob> {
  return startPull(workspaceId, requestId, 'folders')
}

export async function startFullPull(workspaceId: string, requestId?: string): Promise<PullJob> {
  return startPull(workspaceId, requestId, 'full')
}

async function startPull(workspaceId: string, requestId: string | undefined, kind: PullJob['kind']): Promise<PullJob> {
  try {
    if (activeJobs.get(workspaceId) !== 'starting') throw new PullJobError('A pull is already running', 409)
    const selected = await requireWorkspaceProject(workspaceId)
    if (!selected.jiraProjectId) throw new PullJobError('Select and verify a Jira/Xray project before pulling.', 409)
    if (activeJobs.get(workspaceId) !== 'starting') throw new PullJobError('A pull is already running', 409)
    const job: PullJob = {
      id: randomUUID(),
      workspaceId,
      projectId: selected.jiraProjectId,
      state: 'running',
      fetched: 0,
      total: null,
      folders: null,
      requestId,
      startedAt: new Date().toISOString(),
      kind,
    }
    jobs.set(job.id, job)
    activeJobs.set(workspaceId, job.id)
    void (kind === 'folders' ? pullFolders(job, job.projectId) : pullFull(job, job.projectId)).finally(() => {
      if (activeJobs.get(workspaceId) === job.id) activeJobs.delete(workspaceId)
    })
    return { ...job }
  } catch (error) {
    releasePullReservation(workspaceId)
    throw error
  }
}

async function pullFull(job: PullJob, projectId: string): Promise<void> {
  const startedAt = Date.now()
  logger.info('test index pull started', { workspaceId: job.workspaceId, projectId })
  try {
    const folders = await getXrayProjectFolders(job.workspaceId, projectId)
    const tests: Array<{ issueId: string; key: string; summary: string; folderPath: string | null }> = []
    let start = 0
    let total = 0
    do {
      const page = await getXrayTestsPage(job.workspaceId, projectId, start, 100)
      if (page.total < total || page.start !== start || page.results.length > page.limit) {
        throw new Error('Xray returned inconsistent test pagination.')
      }
      total = page.total
      for (const test of page.results) {
        const jira = asRecord(test.jira)
        if (typeof test.issueId !== 'string' || !test.issueId || typeof jira.key !== 'string' || !jira.key || typeof jira.summary !== 'string') {
          throw new Error('Xray returned an index entry missing its issue identity, key, or name.')
        }
        tests.push({ issueId: test.issueId, key: jira.key, summary: jira.summary, folderPath: test.folder?.path ?? null })
      }
      job.fetched = tests.length
      job.total = total
      if (page.results.length === 0 && start < total) throw new Error('Xray returned an incomplete test page.')
      start += page.results.length
    } while (start < total)

    const pulledAt = new Date()
    const prisma = usePrisma()
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${job.workspaceId} FOR UPDATE`
      const current = await tx.workspace.findUnique({ where: { id: job.workspaceId }, select: { jiraProjectId: true } })
      if (!current || current.jiraProjectId !== projectId) {
        throw new PullJobError('The selected project changed during the pull. Start a new pull.', 409)
      }
      const existingFolders = await tx.folder.findMany({ where: { workspaceId: job.workspaceId, jiraProjectId: projectId } })
      const foldersByPath = new Map(existingFolders.map((folder) => [folder.path, folder]))
      let foldersCreated = 0
      let foldersUpdated = 0
      for (const folder of folders) {
        const previous = foldersByPath.get(folder.path)
        if (!previous) {
          await tx.folder.create({ data: { workspaceId: job.workspaceId, jiraProjectId: projectId, ...folder } })
          foldersCreated += 1
        } else if (previous.name !== folder.name || previous.parentPath !== folder.parentPath || previous.remoteTestsCount !== folder.remoteTestsCount) {
          await tx.folder.update({ where: { id: previous.id }, data: { ...folder, pulledAt } })
          foldersUpdated += 1
        }
      }
      const livePaths = new Set(folders.map((folder) => folder.path))
      const staleFolders = existingFolders.filter((folder) => !livePaths.has(folder.path))
      if (staleFolders.length) await tx.folder.deleteMany({ where: { id: { in: staleFolders.map((folder) => folder.id) } } })

      const existingTests = await tx.testCase.findMany({
        where: { workspaceId: job.workspaceId, jiraProjectId: projectId, origin: 'REMOTE' },
        include: { draft: true, snapshot: true },
      })
      const testsByIssue = new Map(existingTests.map((test) => [test.issueId, test]))
      const liveIssues = new Set(tests.map((test) => test.issueId))
      for (const remote of tests) {
        const previous = testsByIssue.get(remote.issueId)
        if (previous) {
          if (previous.key !== remote.key || previous.summary !== remote.summary || previous.folderPath !== remote.folderPath || previous.testType !== null || previous.remoteDeletedAt) {
            await tx.testCase.update({
              where: { id: previous.id },
              data: { key: remote.key, summary: remote.summary, folderPath: remote.folderPath, testType: null, remoteDeletedAt: null },
            })
          }
        } else {
          await tx.testCase.create({
              data: {
                workspaceId: job.workspaceId,
                jiraProjectId: projectId,
                issueId: remote.issueId,
                key: remote.key,
                summary: remote.summary,
                folderPath: remote.folderPath,
                origin: 'REMOTE',
              },
            })
        }
      }
      const staleTests = existingTests.filter((test) => !liveIssues.has(test.issueId))
      const preserve = staleTests.filter((test) => test.draft)
      const remove = staleTests.filter((test) => !test.draft)
      if (preserve.length) {
        await tx.testCase.updateMany({ where: { id: { in: preserve.map((test) => test.id) } }, data: { remoteDeletedAt: pulledAt } })
      }
      if (remove.length) await tx.testCase.deleteMany({ where: { id: { in: remove.map((test) => test.id) } } })
      await tx.workspace.update({ where: { id: job.workspaceId }, data: { foldersPulledAt: pulledAt } })
      return {
        foldersCreated,
        foldersUpdated,
        foldersDeleted: staleFolders.length,
        testsCreated: tests.filter((test) => !testsByIssue.has(test.issueId)).length,
        testsUpdated: tests.filter((test) => testsByIssue.has(test.issueId)).length,
        testsDeleted: remove.length,
        testsPreservedDeleted: preserve.length,
      }
    })
    job.fetched = tests.length
    job.total = tests.length
    job.folders = folders.length
    job.state = 'succeeded'
    job.finishedAt = new Date().toISOString()
    job.message = `Pulled ${tests.length} tests, ${folders.length} folders`
    logger.info('test index pull completed', { workspaceId: job.workspaceId, projectId, ...result, durationMs: Date.now() - startedAt })
  } catch (error) {
    job.state = 'failed'
    job.message = error instanceof PullJobError
      ? error.message
      : 'Xray tests could not be pulled. Check the Xray connection and try again.'
    job.finishedAt = new Date().toISOString()
    logger.error('full pull failed', { workspaceId: job.workspaceId, projectId, error, durationMs: Date.now() - startedAt })
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

async function pullFolders(job: PullJob, projectId: string): Promise<void> {
  const startedAt = Date.now()
  logger.info('folder pull started', { workspaceId: job.workspaceId, projectId })
  try {
    const folders = await getXrayProjectFolders(job.workspaceId, projectId)
    const prisma = usePrisma()
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${job.workspaceId} FOR UPDATE`
      const current = await tx.workspace.findUnique({
        where: { id: job.workspaceId },
        select: { jiraProjectId: true },
      })
      if (!current || current.jiraProjectId !== projectId) {
        throw new PullJobError('The selected project changed during the pull. Start a new pull.', 409)
      }
      const existing = await tx.folder.findMany({
        where: { workspaceId: job.workspaceId, jiraProjectId: projectId },
      })
      const byPath = new Map(existing.map((folder) => [folder.path, folder]))
      let created = 0
      let updated = 0
      for (const folder of folders) {
        const previous = byPath.get(folder.path)
        if (!previous) {
          await tx.folder.create({
            data: { workspaceId: job.workspaceId, jiraProjectId: projectId, ...folder },
          })
          created += 1
        } else if (
          previous.name !== folder.name || previous.parentPath !== folder.parentPath ||
          previous.remoteTestsCount !== folder.remoteTestsCount
        ) {
          await tx.folder.update({
            where: { id: previous.id },
            data: { name: folder.name, parentPath: folder.parentPath, remoteTestsCount: folder.remoteTestsCount, pulledAt: new Date() },
          })
          updated += 1
        }
      }
      const paths = folders.map((folder) => folder.path)
      const stale = existing.filter((folder) => !paths.includes(folder.path))
      if (stale.length > 0) {
        await tx.folder.deleteMany({ where: { id: { in: stale.map((folder) => folder.id) } } })
      }
      await tx.workspace.update({ where: { id: job.workspaceId }, data: { foldersPulledAt: new Date() } })
      return { created, updated, deleted: stale.length }
    })
    job.fetched = folders.length
    job.folders = folders.length
    job.total = folders.length
    job.state = 'succeeded'
    job.finishedAt = new Date().toISOString()
    job.message = `Pulled ${folders.length} folders`
    logger.info('folder pull completed', {
      workspaceId: job.workspaceId,
      projectId,
      ...result,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    job.state = 'failed'
    job.message = error instanceof PullJobError
      ? error.message
      : 'Xray folders could not be pulled. Check the Xray connection and try again.'
    job.finishedAt = new Date().toISOString()
    logger.error('folder pull failed', { workspaceId: job.workspaceId, projectId, error, durationMs: Date.now() - startedAt })
  }
}
