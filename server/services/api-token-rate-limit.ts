import { createHash, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'

const WINDOW_MS = 60_000
const LIMIT = 10

function normalizedIp(value: string | undefined): string {
  if (!value) return 'unknown'
  const ip = value.startsWith('::ffff:') ? value.slice(7) : value
  return ip.toLowerCase()
}

export function clientIp(event: H3Event): string {
  const remoteAddress = event.node.req.socket.remoteAddress
  const direct = normalizedIp(remoteAddress)
  const configured = useRuntimeConfig().trustedProxyIps
  const trustedProxyIps = Array.isArray(configured)
    ? configured
    : typeof configured === 'string'
      ? configured.split(',').map((ip) => ip.trim()).filter(Boolean)
      : []
  if (!trustedProxyIps.includes(direct)) return direct

  const forwarded = getHeader(event, 'x-forwarded-for')
  if (!forwarded) return direct
  const chain = forwarded.split(',').map((ip) => normalizedIp(ip.trim()))
  const validChain = chain.every((ip) => ip !== 'unknown')
  if (!validChain || chain.length === 0) return direct

  // The direct peer is trusted. Walk from the right and choose the first address
  // that was not itself configured as a trusted proxy.
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const candidate = chain[index]
    if (candidate && !trustedProxyIps.includes(candidate)) return candidate
  }
  return chain[0] ?? direct
}

export async function consumeApiTokenSignInAttempt(event: H3Event): Promise<boolean> {
  const hash = createHash('sha256').update(clientIp(event)).digest('hex')
  const prisma = usePrisma()
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${hash})) IS NULL AS locked`
    const since = new Date(Date.now() - WINDOW_MS)
    const rows = await tx.apiTokenSignInAttempt.findMany({
      where: { ipHash: hash, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
      take: LIMIT,
      select: { createdAt: true },
    })
    if (rows.length >= LIMIT) return false
    await tx.apiTokenSignInAttempt.create({ data: { id: randomUUID(), ipHash: hash } })
    await tx.apiTokenSignInAttempt.deleteMany({ where: { createdAt: { lte: since } } })
    return true
  })
}
