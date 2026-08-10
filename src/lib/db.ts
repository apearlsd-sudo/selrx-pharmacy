import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Creates the Prisma client instance.
 *
 * IMPORTANT: This module should ONLY be imported dynamically via
 * `await import('@/lib/db')` inside code paths that are NOT reached on
 * Vercel (i.e., the `else` branch of `if (isTurso())` checks).
 *
 * On Vercel + Turso, the Prisma+LibSQL adapter has a known runtime crash.
 * All production code paths use raw @libsql/client via @/lib/turso instead.
 *
 * This module is wrapped in try-catch so that if Prisma initialization fails
 * for any reason, it doesn't crash the entire serverless function.
 */
function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL

  if (tursoUrl) {
    if (!process.env.DATABASE_URL?.startsWith('file:')) {
      process.env.DATABASE_URL = 'file:./dummy.db'
    }

    try {
      const adapter = new PrismaLibSQL({
        url: tursoUrl,
        authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
      })
      return new PrismaClient({ adapter, log: ['error', 'warn'] })
    } catch (error) {
      console.error('[db.ts] Failed to create Prisma+LibSQL adapter. This is expected on Vercel. Use @/lib/turso instead.', error)
      // Return a minimal Prisma client that will fail gracefully on use
      // rather than crashing at module load time
      return new PrismaClient({ log: ['error'] })
    }
  }

  return new PrismaClient({ log: ['error', 'warn'] })
}

let _db: PrismaClient | undefined

try {
  _db = globalForPrisma.prisma ?? createPrismaClient()
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _db
} catch (error) {
  console.error('[db.ts] Prisma client initialization failed:', error)
}

/**
 * Prisma client instance.
 *
 * ⚠️ WARNING: Do NOT statically import this in any file that runs on Vercel.
 * Always use `await import('@/lib/db')` inside a conditional branch.
 * For production (Turso), use `import { turso } from '@/lib/turso'` instead.
 */
export const db = _db!
