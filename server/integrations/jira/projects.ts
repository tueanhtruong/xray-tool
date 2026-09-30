import { z } from 'zod'
import type { WorkspaceJiraClient } from './client'

const projectSchema = z.object({
  id: z.string().regex(/^\d+$/),
  key: z.string().min(1),
  name: z.string().min(1),
})

const searchSchema = z.object({
  values: z.array(projectSchema),
  startAt: z.number().int().nonnegative(),
  maxResults: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  isLast: z.boolean().optional(),
})

const projectMetadataSchema = z.object({
  id: z.string().regex(/^\d+$/),
  key: z.string().min(1),
  name: z.string().min(1),
})
const issueTypesSchema = z.array(z.object({ id: z.string().min(1), name: z.string().min(1) }))

const statusesSchema = z.array(z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  statuses: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })),
}))

export interface JiraProject {
  id: string
  key: string
  name: string
}

export interface JiraProjectPage {
  values: JiraProject[]
  startAt: number
  maxResults: number
  total: number
  isLast: boolean
}

export interface JiraProjectMetadata extends JiraProject {
  testIssueType: { id: string; name: string }
  statuses: Array<{ id: string; name: string }>
}

export class JiraProjectApiError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message)
    this.name = 'JiraProjectApiError'
  }
}

async function readJiraJson<T>(
  client: WorkspaceJiraClient,
  path: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Response
  try {
    response = await client.fetch(path, { headers: { accept: 'application/json' } })
  } catch {
    throw new JiraProjectApiError('Jira could not be reached. Check the connection and try again.')
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new JiraProjectApiError('Jira denied access to project metadata. Check the account permissions.', 403)
    }
    throw new JiraProjectApiError('Jira could not complete the project request. Please try again.')
  }
  const parsed = schema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success) {
    throw new JiraProjectApiError('Jira returned invalid project metadata. Please try again.')
  }
  return parsed.data
}

export async function searchJiraProjects(
  client: WorkspaceJiraClient,
  query: string,
  startAt: number,
  maxResults: number,
): Promise<JiraProjectPage> {
  const params = new URLSearchParams({ query, startAt: String(startAt), maxResults: String(maxResults) })
  const page = await readJiraJson(
    client,
    `/rest/api/3/project/search?${params.toString()}`,
    searchSchema,
  )
  return { ...page, isLast: page.isLast ?? page.startAt + page.values.length >= page.total }
}

export async function getJiraProjectMetadata(
  client: WorkspaceJiraClient,
  projectId: string,
): Promise<JiraProjectMetadata> {
  const project = await readJiraJson(
    client,
    `/rest/api/3/project/${encodeURIComponent(projectId)}`,
    projectMetadataSchema,
  )
  const issueTypes = await readJiraJson(
    client,
    `/rest/api/3/issuetype/project?projectId=${encodeURIComponent(project.id)}`,
    issueTypesSchema,
  )
  const testIssueType = issueTypes.find((issueType) => issueType.name.toLowerCase() === 'test')
  if (!testIssueType) {
    throw new JiraProjectApiError(
      `Xray is not enabled for project ${project.key}: the Jira Test issue type is missing.`,
      422,
    )
  }
  const groupedStatuses = await readJiraJson(
    client,
    `/rest/api/3/project/${encodeURIComponent(project.id)}/statuses`,
    statusesSchema,
  )
  const issueTypeStatuses = groupedStatuses.find((entry) => entry.id === testIssueType.id)
  if (!issueTypeStatuses) {
    throw new JiraProjectApiError(
      `Jira returned no statuses for the Test issue type in project ${project.key}.`,
    )
  }
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    testIssueType,
    statuses: issueTypeStatuses.statuses,
  }
}
