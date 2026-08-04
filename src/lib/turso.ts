/**
 * src/lib/turso.ts
 *
 * Shared Turso/libsql client singleton.
 * All API routes should use this instead of Prisma's db client
 * to avoid the Prisma+LibSQL adapter runtime crash on Vercel.
 *
 * Usage:
 *   import { turso } from '@/lib/turso'
 *   const result = await turso.execute({ sql: 'SELECT ...', args: [...] })
 */

import { createClient, type Client } from '@libsql/client'

const globalForTurso = globalThis as unknown as {
  turso: Client | undefined
}

/**
 * Creates the Turso client.
 *
 * When TURSO_DATABASE_URL is set (Vercel / local-with-Turso):
 *   Returns a real libsql Client — no Proxy, no indirection.
 *
 * When TURSO_DATABASE_URL is NOT set (build / local-without-Turso):
 *   Returns a dead-client placeholder that throws a clear error on any
 *   method call. This allows the module to load during `next build`
 *   without crashing, while still failing fast if accidentally used.
 */
function createTursoClient(): Client {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const authToken = process.env.DATABASE_AUTH_TOKEN

  if (!tursoUrl) {
    // Dead client — module loads safely, but any actual use throws immediately
    return new Proxy({} as Client, {
      get() {
        throw new Error(
          '[turso] TURSO_DATABASE_URL is not set. ' +
          'Database operations are unavailable. ' +
          'This is expected during `next build` or local dev without Turso.'
        )
      },
    })
  }

  return createClient({
    url: tursoUrl,
    authToken: authToken || undefined,
  })
}

/**
 * Singleton turso client. Uses globalThis singleton pattern to survive
 * hot reloads during local dev (same pattern as Prisma's recommended setup).
 */
export const turso: Client =
  globalForTurso.turso ?? createTursoClient()

if (process.env.NODE_ENV !== 'production') {
  globalForTurso.turso = turso
}

/**
 * Returns true if we're running with a remote Turso database.
 * Routes can check this to decide whether to use raw SQL or Prisma fallback.
 */
export function isTurso(): boolean {
  return !!process.env.TURSO_DATABASE_URL
}

/**
 * Sanitize args array — filters out undefined values that libsql rejects.
 */
export function safeArgs(args: unknown[]): unknown[] {
  return args.filter((a) => a !== undefined)
}

/**
 * Execute a query with automatic retry on transient failures.
 */
export async function tursoExecute(
  params: { sql: string; args?: (string | number | boolean | null | undefined)[] },
  maxRetries = 2
) {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await turso.execute(params)
    } catch (error) {
      lastError = error
      const isTransient =
        error instanceof Error &&
        (error.message.includes('fetch failed') ||
         error.message.includes('ECONNREFUSED') ||
         error.message.includes('socket hang up') ||
         error.message.includes('INTERNAL_ERROR') ||
         error.message.includes('503') ||
         error.message.includes('429'))

      if (!isTransient || attempt === maxRetries) throw error

      const delay = 200 * Math.pow(3, attempt)
      console.warn(`[turso] Query failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, error instanceof Error ? error.message : error)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

/**
 * Execute multiple statements in a batch with retry.
 */
export async function tursoBatch(
  stmts: Array<{ sql: string; args?: (string | number | boolean | null | undefined)[] }>,
  maxRetries = 2
) {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await turso.batch(stmts)
    } catch (error) {
      lastError = error
      const isTransient =
        error instanceof Error &&
        (error.message.includes('fetch failed') ||
         error.message.includes('ECONNREFUSED') ||
         error.message.includes('socket hang up') ||
         error.message.includes('INTERNAL_ERROR') ||
         error.message.includes('503') ||
         error.message.includes('429'))

      if (!isTransient || attempt === maxRetries) throw error

      const delay = 200 * Math.pow(3, attempt)
      console.warn(`[turso] Batch failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

/**
 * Generate a CUID-like ID (compatible with existing Prisma-generated IDs).
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 15)
  const random2 = Math.random().toString(36).substring(2, 10)
  return `${timestamp}${random}${random2}`
}

/**
 * Transaction number generator: TXN-YYYYMMDD-XXXX format
 */
export function generateTransactionNo(): string {
  const d = new Date()
  const date = d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `TXN-${date}-${seq}`
}

/**
 * Return number generator: RTN-YYYYMMDD-XXXX format
 */
export function generateReturnNo(): string {
  const d = new Date()
  const date = d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `RTN-${date}-${seq}`
}

/**
 * Rx number generator: RX-XXXXXXXX format
 */
export function generateRxNumber(): string {
  const seq = String(Math.floor(Math.random() * 100000000)).padStart(8, '0')
  return `RX-${seq}`
}

/**
 * Batch number generator: BN-DDMMYYYY-XXXX format
 */
export function generateBatchNo(): string {
  const d = new Date()
  const date = String(d.getDate()).padStart(2, '0') +
    String(d.getMonth() + 1).padStart(2, '0') +
    d.getFullYear().toString()
  const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `BN-${date}-${seq}`
}

/**
 * Stock take reference generator: ST-YYYYMMDD-XXXX format
 */
export function generateStockTakeRef(): string {
  const d = new Date()
  const date = d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `ST-${date}-${seq}`
}
