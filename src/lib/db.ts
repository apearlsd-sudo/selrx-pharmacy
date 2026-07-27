import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Creates the Prisma client instance.
 *
 * On Vercel + Turso:
 *   Uses @prisma/adapter-libsql with @libsql/client for cloud SQLite.
 *   Requires env vars: TURSO_DATABASE_URL, DATABASE_AUTH_TOKEN
 *
 * Locally / sandbox:
 *   Uses Prisma's built-in SQLite driver with DATABASE_URL (file:).
 */
function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL

  if (tursoUrl && typeof require === 'function') {
    try {
      // These packages are installed ONLY in Vercel's build environment
      // via scripts/install-turso-adapter.mjs (called by npm run build).
      // This prevents Turbopack from statically bundling them locally.
      const { PrismaLibSql } = require('@prisma/adapter-libsql')
      const { createClient } = require('@libsql/client')

      const libsql = createClient({
        url: tursoUrl,
        authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
      })
      const adapter = new PrismaLibSql(libsql)
      const client = new PrismaClient({ adapter, log: ['error', 'warn'] })
      console.log('[db] Connected via Turso LibSQL adapter')
      return client
    } catch (e) {
      console.error('[db] Failed to load LibSQL adapter, falling back to Prisma SQLite:', e)
    }
  }

  // Default: Prisma built-in SQLite driver (local dev)
  return new PrismaClient({ log: ['error', 'warn'] })
}

export const db =
  globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
