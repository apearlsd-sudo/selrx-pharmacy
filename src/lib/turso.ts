/**
 * src/lib/turso.ts
 *
 * Shared Turso/libsql client with lazy initialization and retry logic.
 * All API routes should use this instead of Prisma's db client
 * to avoid the Prisma+LibSQL adapter runtime crash on Vercel.
 *
 * Usage:
 *   import { turso } from '@/lib/turso'
 *   const result = await turso.execute({ sql: 'SELECT ...', args: [...] })
 */

import { createClient, type Client } from '@libsql/client'

const _globalForTurso = globalThis as unknown as {
  turso: Client | undefined
  _tursoCreating: Promise<Client> | undefined
}

/**
 * Lazily create the Turso client — only connects when actually used,
 * not at module load time. This prevents build failures when
 * TURSO_DATABASE_URL is not set during `next build`.
 */
function getOrCreateTurso(): Client {
  // Return cached singleton if available
  if (_globalForTurso.turso) return _globalForTurso.turso

  const tursoUrl = process.env.TURSO_DATABASE_URL
  if (!tursoUrl) {
    throw new Error(
      'TURSO_DATABASE_URL is not set. ' +
      'This is expected during build or if running locally without Turso. ' +
      'Set TURSO_DATABASE_URL in your .env or Vercel environment variables.'
    )
  }

  const client = createClient({
    url: tursoUrl,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  })

  if (process.env.NODE_ENV !== 'production') {
    _globalForTurso.turso = client
  }

  return client
}

/**
 * Turso client proxy — lazily initializes on first use.
 * In development, the singleton is cached on globalThis to survive HMR.
 * In production (Vercel), a new client is created per serverless invocation,
 * which is the correct behavior for serverless functions.
 */
export const turso: Client = new Proxy({} as Client, {
  get(_target, prop, receiver) {
    const client = getOrCreateTurso()
    const value = Reflect.get(client, prop, receiver)
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

/**
 * Returns true if we're running with a remote Turso database.
 * Routes can check this to decide whether to use raw SQL or Prisma fallback.
 */
export function isTurso(): boolean {
  return !!process.env.TURSO_DATABASE_URL
}

/**
 * Execute a query with automatic retry on transient failures.
 * Turso HTTP connections can occasionally fail with network errors;
 * this wrapper retries up to `maxRetries` times with exponential backoff.
 */
export async function tursoExecute(
  params: { sql: string; args?: unknown[] },
  maxRetries = 2
) {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await turso.execute(params as { sql: string; args?: (string | number | boolean | null | undefined)[] })
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
  stmts: Array<{ sql: string; args?: unknown[] }>,
  maxRetries = 2
) {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await turso.batch(stmts as Array<{ sql: string; args?: (string | number | boolean | null | undefined)[] }>)
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