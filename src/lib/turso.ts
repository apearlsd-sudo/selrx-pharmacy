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

const _globalForTurso = globalThis as unknown as {
  turso: Client | undefined
}

function createTursoClient(): Client {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const authToken = process.env.DATABASE_AUTH_TOKEN

  if (!tursoUrl) {
    throw new Error('TURSO_DATABASE_URL is not set')
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
  _globalForTurso.turso ?? createTursoClient()

if (process.env.NODE_ENV !== 'production') {
  _globalForTurso.turso = turso
}

/**
 * Returns true if we're running with a remote Turso database.
 * Routes can check this to decide whether to use raw SQL or Prisma fallback.
 */
export function isTurso(): boolean {
  return !!process.env.TURSO_DATABASE_URL
}

/**
 * Generate a CUID-like ID (compatible with existing Prisma-generated IDs).
 * Uses crypto.randomUUID() which is available in Node 19+ / Vercel edge.
 */
export function generateId(): string {
  // Simple fallback that produces unique 25-char strings similar to cuid
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
