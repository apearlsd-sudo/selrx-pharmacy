import { NextResponse } from 'next/server'

/**
 * Health check — tests both Turso (raw libsql) and Prisma connectivity.
 * Useful for diagnosing login 500 errors.
 */
export async function GET() {
  const results: Record<string, string> = {}

  // 1. Check env vars
  results.TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL ? 'SET' : 'MISSING'
  results.DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN ? 'SET' : 'MISSING'
  results.DATABASE_URL = process.env.DATABASE_URL || 'MISSING'

  // 2. Test raw libsql connection
  if (process.env.TURSO_DATABASE_URL) {
    try {
      const { createClient } = await import('@libsql/client')
      const turso = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
      })
      const r = await turso.execute('SELECT COUNT(*) as cnt FROM "User"')
      results.libsql = `OK (${r.rows[0].cnt as number} users)`
    } catch (e: any) {
      results.libsql = `FAIL: ${e.message?.substring(0, 200)}`
    }
  } else {
    results.libsql = 'SKIPPED (no TURSO_DATABASE_URL)'
  }

  // 3. Test Prisma connection
  try {
    const { db } = await import('@/lib/db')
    const count = await db.user.count()
    results.prisma = `OK (${count} users)`
  } catch (e: any) {
    results.prisma = `FAIL: ${e.message?.substring(0, 200)}`
  }

  const allOk = results.libsql?.startsWith('OK') || results.prisma?.startsWith('OK')
  return NextResponse.json(results, { status: allOk ? 200 : 503 })
}
