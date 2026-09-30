import { getAppSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true, jiraProjectId: true, projectReadyAt: true, foldersPulledAt: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  if (!workspace.projectReadyAt || !workspace.jiraProjectId) {
    throw httpError(409, 'Select and verify a Jira/Xray project before opening the test repository.')
  }
  const folders = await usePrisma().folder.findMany({
    where: { workspaceId: workspace.id, jiraProjectId: workspace.jiraProjectId },
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
  return { folders: buildTree('/'), foldersPulledAt: workspace.foldersPulledAt }
})
