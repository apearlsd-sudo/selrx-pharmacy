import { NextResponse } from 'next/server'

/**
 * Health check — tests database connectivity.
 * Returns minimal info: status only. No env var disclosure.
 */
export async function GET() {
  let dbOk = false

  // Test raw libsql connection
  if (process.env.TURSO_DATABASE_URL) {
    try {
      const { createClient } = await import('@libsql/client')
      const turso = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_API_TOKEN || undefined,
      })
      await turso.execute('SELECT 1')
      dbOk = true
    } catch {
      dbOk = false
    }
  } else {
    // Try Prisma fallback
    try {
      const { db } = await import('@/lib/db')
      await db.user.count()
      dbOk = true
    } catch {
      dbOk = false
    }
  }

  return NextResponse.json(
    { status: dbOk ? 'ok' : 'degraded', timestamp: new Date().toISOString() },
    { status: dbOk ? 200 : 503 }
  )
}
