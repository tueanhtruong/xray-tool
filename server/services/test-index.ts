import { z } from 'zod'

export const indexFilterSchema = z.object({
  q: z.string().trim().max(200).optional().default(''),
  folder: z.string().max(512).optional(),
  includeDescendants: z.enum(['true', 'false']).optional().default('false'),
})

export type IndexFilter = z.infer<typeof indexFilterSchema>

/** Largest key-set a select-all may return; larger filters must be narrowed first. */
export const MAX_SELECT_ALL = 5000

export function testIndexWhere(projectId: string, params: IndexFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {
    projectId,
    origin: 'REMOTE',
    remoteDeletedAt: null,
  }
  const and: Record<string, unknown>[] = []
  if (params.folder && params.includeDescendants === 'true') {
    and.push({
      OR: [
        { folderPath: params.folder },
        { folderPath: { startsWith: `${params.folder === '/' ? '' : params.folder}/` } },
      ],
    })
  } else if (params.folder) {
    where.folderPath = params.folder
  }
  if (params.q) {
    and.push({
      OR: [
        { key: { contains: params.q, mode: 'insensitive' } },
        { summary: { contains: params.q, mode: 'insensitive' } },
      ],
    })
  }
  if (and.length > 0) where.AND = and
  return where
}
