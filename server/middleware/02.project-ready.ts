import { getRequestURL, sendRedirect } from 'h3'
import { getWorkspaceProjectReadiness } from '../services/project-selection'
import { getAppSession } from '../utils/session'

export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event)
  const isRepositoryApi = pathname === '/api/repository' || pathname.startsWith('/api/repository/') ||
    pathname === '/api/pull' || pathname.startsWith('/api/pull/') ||
    pathname === '/api/folders' || pathname === '/api/tests' || pathname.startsWith('/api/tests/')
  const isRepositoryPage = pathname === '/repository' || pathname.startsWith('/repository/') ||
    pathname === '/tests' || pathname.startsWith('/tests/')
  if (!isRepositoryPage && !isRepositoryApi) return
  if (isRepositoryApi) {
    const apiSession = await getAppSession(event)
    if (!apiSession) return
    const apiProject = await getWorkspaceProjectReadiness(apiSession.activeWorkspaceId)
    if (!apiProject?.projectReadyAt || !apiProject.jiraProjectId) {
      throw httpError(409, 'Select and verify a Jira/Xray project before opening the test repository.')
    }
    return
  }
  const session = await getAppSession(event)
  if (!session) return
  const project = await getWorkspaceProjectReadiness(session.activeWorkspaceId)
  if (project?.projectReadyAt && project.jiraProjectId) return
  return sendRedirect(event, '/settings', 302)
})
