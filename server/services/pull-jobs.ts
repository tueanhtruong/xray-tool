import { randomUUID } from 'node:crypto'
import { getXrayProjectFolders, getXrayTestsPage } from '../integrations/xray/client'
import { logger } from '../utils/logger'

export interface PullJob {
  id: string
  workspaceId: string
  projectId: string
  jiraProjectId: string
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

export function getPullJob(projectId: string): PullJob | undefined {
  const activeId = activeJobs.get(projectId)
  const id = activeId && activeId !== 'starting'
    ? activeId
    : [...jobs.values()].findLast((job) => job.projectId === projectId)?.id
  const job = id ? jobs.get(id) : undefined
  return job ? { ...job } : undefined
}

export function reservePull(projectId: string): void {
  if (activeJobs.has(projectId)) throw new PullJobError('A pull is already running', 409)
  activeJobs.set(projectId, 'starting')
}

export function releasePullReservation(projectId: string): void {
  if (activeJobs.get(projectId) === 'starting') activeJobs.delete(projectId)
}

export async function startFolderPull(workspaceId: string, projectId: string, requestId?: string): Promise<PullJob> {
  return startPull(workspaceId, projectId, requestId, 'folders')
}

export async function startFullPull(workspaceId: string, projectId: string, requestId?: string): Promise<PullJob> {
  return startPull(workspaceId, projectId, requestId, 'full')
}

async function startPull(workspaceId: string, projectId: string, requestId: string | undefined, kind: PullJob['kind']): Promise<PullJob> {
  try {
    if (activeJobs.get(projectId) !== 'starting') throw new PullJobError('A pull is already running', 409)
    const selected = await usePrisma().workspaceProject.findFirst({
      where: { workspaceId, projectId },
      include: { project: { select: { jiraProjectId: true } } },
    })
    if (!selected) throw new PullJobError('Project access is not authorized.', 404)
    if (activeJobs.get(projectId) !== 'starting') throw new PullJobError('A pull is already running', 409)
    const job: PullJob = {
      id: randomUUID(),
      workspaceId,
      projectId,
      jiraProjectId: selected.project.jiraProjectId,
      state: 'running',
      fetched: 0,
      total: null,
      folders: null,
      requestId,
      startedAt: new Date().toISOString(),
      kind,
    }
    jobs.set(job.id, job)
    activeJobs.set(projectId, job.id)
    void (kind === 'folders' ? pullFolders(job) : pullFull(job)).finally(() => {
      if (activeJobs.get(projectId) === job.id) activeJobs.delete(projectId)
    })
    return { ...job }
  } catch (error) {
    releasePullReservation(projectId)
    throw error
  }
}

async function pullFull(job: PullJob): Promise<void> {
  const { projectId, jiraProjectId } = job
  const startedAt = Date.now()
  logger.info('test index pull started', { workspaceId: job.workspaceId, projectId })
  try {
    const folders = await getXrayProjectFolders(job.workspaceId, jiraProjectId)
    const tests: Array<{ issueId: string; key: string; summary: string; folderPath: string | null }> = []
    let start = 0
    let total = 0
    do {
      const page = await getXrayTestsPage(job.workspaceId, jiraProjectId, start, 100)
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
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`
      const current = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } })
      if (!current) throw new PullJobError('Project no longer exists.', 409)
      const existingFolders = await tx.folder.findMany({ where: { projectId } })
      const foldersByPath = new Map(existingFolders.map((folder) => [folder.path, folder]))
      let foldersCreated = 0
      let foldersUpdated = 0
      for (const folder of folders) {
        const previous = foldersByPath.get(folder.path)
        if (!previous) {
          await tx.folder.create({ data: { projectId, ...folder } })
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
        where: { projectId, origin: 'REMOTE' },
        include: { drafts: true, snapshot: true },
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
                projectId,
                issueId: remote.issueId,
                key: remote.key,
                summary: remote.summary,
                folderPath: remote.folderPath,
                origin: 'REMOTE',
              },
            })
        }
      }
      const staleTests = existingTests.filter((test) => test.issueId && !liveIssues.has(test.issueId))
      const preserve = staleTests.filter((test) => test.drafts.length > 0)
      const remove = staleTests.filter((test) => test.drafts.length === 0)
      if (preserve.length) {
        await tx.testCase.updateMany({ where: { id: { in: preserve.map((test) => test.id) } }, data: { remoteDeletedAt: pulledAt } })
      }
      if (remove.length) await tx.testCase.deleteMany({ where: { id: { in: remove.map((test) => test.id) } } })
      await tx.project.update({ where: { id: projectId }, data: { foldersPulledAt: pulledAt } })
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

async function pullFolders(job: PullJob): Promise<void> {
  const { projectId, jiraProjectId } = job
  const startedAt = Date.now()
  logger.info('folder pull started', { workspaceId: job.workspaceId, projectId })
  try {
    const folders = await getXrayProjectFolders(job.workspaceId, jiraProjectId)
    const prisma = usePrisma()
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`
      const current = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } })
      if (!current) throw new PullJobError('Project no longer exists.', 409)
      const existing = await tx.folder.findMany({
        where: { projectId },
      })
      const byPath = new Map(existing.map((folder) => [folder.path, folder]))
      let created = 0
      let updated = 0
      for (const folder of folders) {
        const previous = byPath.get(folder.path)
        if (!previous) {
          await tx.folder.create({
            data: { projectId, ...folder },
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
      await tx.project.update({ where: { id: projectId }, data: { foldersPulledAt: new Date() } })
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
