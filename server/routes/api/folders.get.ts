import { getQuery } from 'h3'
import { getAppSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const projectId = getQuery(event).project
  if (typeof projectId !== 'string') throw httpError(409, 'Choose a project before opening the test repository.')
  const project = await usePrisma().workspaceProject.findFirst({
    where: { workspaceId: workspace.id, projectId },
    include: { project: { select: { foldersPulledAt: true } } },
  })
  if (!project) throw httpError(404, 'Project not found or access is not authorized.')
  const folders = await usePrisma().folder.findMany({
    where: { projectId },
    orderBy: { path: 'asc' },
    select: { path: true, name: true, parentPath: true, remoteTestsCount: true, pulledAt: true },
  })
  const foldersByParent = new Map<string, typeof folders>()
  for (const folder of folders) {
    const parent = folder.parentPath ?? '/'
    foldersByParent.set(parent, [...(foldersByParent.get(parent) ?? []), folder])
  }
  function buildTree(parent: string): Array<{ path: string; name: string; parentPath: string | null; remoteTestsCount: number; folders: ReturnType<typeof buildTree> }> {
    return (foldersByParent.get(parent) ?? []).map((folder) => ({
      path: folder.path,
      name: folder.name,
      parentPath: folder.parentPath,
      remoteTestsCount: folder.remoteTestsCount,
      folders: buildTree(folder.path),
    }))
  }
  return { folders: buildTree('/'), foldersPulledAt: project.project.foldersPulledAt }
})
