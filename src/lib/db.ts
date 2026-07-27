import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Creates the Prisma client instance.
 *
 * Locally / sandbox: Uses Prisma built-in SQLite driver with DATABASE_URL (file:).
 * On Vercel (production): Uses Turso via LibSQL adapter (installed in postinstall).
 */
function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL

  if (tursoUrl && typeof require === 'function') {
    try {
      // These packages are installed ONLY in Vercel's build environment
      // via the postinstall script (not in local dev). This prevents
      // Turbopack from statically bundling the LibSQL adapter modules.
      const { PrismaLibSql } = require('@prisma/adapter-libsql')
      const { createClient } = require('@libsql/client')

      const libsql = createClient({
        url: tursoUrl,
        authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
      })
      const adapter = new PrismaLibSql(libsql)
      return new PrismaClient({ adapter, log: ['error', 'warn'] })
    } catch {
      // Adapter packages not installed — fall through to built-in SQLite
    }
  }

  // Default: Prisma built-in SQLite driver
  return new PrismaClient({ log: ['error', 'warn'] })
}

export const db =
  globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
