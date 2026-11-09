import { PrismaClient } from '@prisma/client'

// Bump this when the schema changes to bust the global singleton cache.
// The dev server keeps globalThis.prisma across hot-reloads, so without
// a version bump a schema change won't take effect until full restart.
const PRISMA_CLIENT_VERSION = 'v3-email-verified-postgres'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __prismaVersion?: string
}

// If the cached client was built with a different schema version, drop it.
if (globalForPrisma.__prismaVersion !== PRISMA_CLIENT_VERSION) {
  globalForPrisma.prisma = undefined
  globalForPrisma.__prismaVersion = PRISMA_CLIENT_VERSION
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
  globalForPrisma.__prismaVersion = PRISMA_CLIENT_VERSION
}