import { getRequestURL, sendRedirect } from 'h3'
import { listWorkspaceProjects, requireAuthorizedProject } from '../services/project-selection'
import { getAppSession } from '../utils/session'

export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event)
  const isRepositoryApi = pathname === '/api/repository' || pathname.startsWith('/api/repository/') ||
    pathname === '/api/pull' || pathname.startsWith('/api/pull/') ||
    pathname === '/api/folders' || pathname === '/api/tests' || pathname.startsWith('/api/tests/')
  const isRepositoryPage = pathname === '/repository' || pathname.startsWith('/repository/') ||
    pathname === '/tests' || pathname.startsWith('/tests/') ||
    (pathname.startsWith('/projects/') && pathname.endsWith('/drafts'))
  if (!isRepositoryPage && !isRepositoryApi) return
  if (isRepositoryApi) {
    const apiSession = await getAppSession(event)
    if (!apiSession) return
    const url = getRequestURL(event)
    const projectId = url.searchParams.get('project') ?? undefined
    if (projectId) await requireAuthorizedProject(apiSession.activeWorkspaceId, projectId)
    else if (pathname === '/api/tests' || pathname === '/api/folders') {
      const projects = await listWorkspaceProjects(apiSession.activeWorkspaceId)
      if (projects.length === 1) {
        const query = new URLSearchParams(url.searchParams)
        query.set('project', projects[0]!.id)
        return sendRedirect(event, `${url.pathname}?${query.toString()}`, 307)
      }
    }
    return
  }
  const session = await getAppSession(event)
  if (!session) return
  const projects = await listWorkspaceProjects(session.activeWorkspaceId)
  if (projects.length === 0) return sendRedirect(event, '/settings', 302)
  const projectId = pathname.startsWith('/projects/')
    ? pathname.split('/')[2]
    : getRequestURL(event).searchParams.get('project')
  if (projectId) {
    if (projects.some((project) => project.id === projectId)) return
    return sendRedirect(event, projects.length === 1 ? `/repository?project=${projects[0]!.id}` : '/settings?chooseProject=1', 302)
  }
  const legacyProject = await usePrisma().workspaceProject.findMany({ where: { workspaceId: session.activeWorkspaceId }, select: { projectId: true }, take: 2 })
  if (legacyProject.length === 1) {
    const url = getRequestURL(event)
    const query = new URLSearchParams(url.searchParams)
    query.set('project', legacyProject[0]!.projectId)
    return sendRedirect(event, `${url.pathname}?${query.toString()}`, 302)
  }
  return sendRedirect(event, '/settings?chooseProject=1', 302)
})
