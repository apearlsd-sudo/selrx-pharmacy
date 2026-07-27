import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Creates the Prisma client instance.
 *
 * On Vercel + Turso:
 *   Uses PrismaLibSQL adapter with config object { url, authToken }.
 *   DATABASE_URL must be a valid file: path for Prisma's schema validation.
 *
 * Locally / sandbox:
 *   Uses Prisma's built-in SQLite driver with DATABASE_URL (file:).
 */
function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL

  if (tursoUrl) {
    // Set a dummy file: URL so Prisma's internal datasource validation passes
    if (!process.env.DATABASE_URL?.startsWith('file:')) {
      process.env.DATABASE_URL = 'file:./dummy.db'
    }

    const adapter = new PrismaLibSQL({
      url: tursoUrl,
      authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
    })
    return new PrismaClient({ adapter, log: ['error', 'warn'] })
  }

  return new PrismaClient({ log: ['error', 'warn'] })
}

export const db =
  globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
