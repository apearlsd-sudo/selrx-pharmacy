import { NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'

/**
 * GET /api/audit-logs/debug
 *
 * Diagnostic endpoint — returns detailed info about the AuditLog table
 * state, attempts a test write + read, and surfaces any errors.
 * Call this from the browser to see exactly why audit logs aren't working.
 *
 * TODO: Remove this endpoint once audit logs are confirmed working.
 */
export async function GET() {
  const steps: { step: string; ok: boolean; detail: string; error?: string }[] = []

  // Step 1: Check environment
  const tursoUrl = !!process.env.TURSO_DATABASE_URL
  steps.push({
    step: 'Environment check',
    ok: true,
    detail: `isTurso=${tursoUrl}, TURSO_DATABASE_URL=${tursoUrl ? process.env.TURSO_DATABASE_URL?.substring(0, 30) + '...' : 'NOT SET'}, NODE_ENV=${process.env.NODE_ENV}`,
  })

  if (!isTurso()) {
    steps.push({
      step: 'Turso not configured',
      ok: false,
      detail: 'TURSO_DATABASE_URL is not set. Using local Prisma path.',
    })
    try {
      const { db } = await import('@/lib/db')
      const count = await db.auditLog.count()
      const sample = await db.auditLog.findMany({ take: 3, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } } } })
      steps.push({ step: 'Prisma read', ok: true, detail: `Found ${count} entries. Latest: ${JSON.stringify(sample.map(s => ({ id: s.id, action: s.action, category: s.category, userId: s.userId })))}` })
    } catch (err) {
      steps.push({ step: 'Prisma read', ok: false, detail: 'Failed', error: err instanceof Error ? err.message : String(err) })
    }
    return NextResponse.json({ steps, tursoActive: false })
  }

  // Step 2: Check if AuditLog table exists
  try {
    const tables = await turso.execute({ sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='AuditLog'`, args: [] })
    const exists = tables.rows.length > 0
    steps.push({
      step: 'Table exists check',
      ok: exists,
      detail: exists ? 'AuditLog table found' : 'AuditLog table NOT found',
    })

    if (exists) {
      const cols = await turso.execute({ sql: `PRAGMA table_info("AuditLog")`, args: [] })
      steps.push({
        step: 'Table columns',
        ok: true,
        detail: `Columns: ${cols.rows.map(r => `${r.name}(${r.type})`).join(', ')}`,
      })
    }
  } catch (err) {
    steps.push({ step: 'Table check', ok: false, detail: 'Failed', error: err instanceof Error ? err.message : String(err) })
  }

  // Step 3: CREATE TABLE IF NOT EXISTS
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "AuditLog" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        action TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        entity TEXT,
        "entityId" TEXT,
        details TEXT,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
      args: [],
    })
    steps.push({ step: 'CREATE TABLE IF NOT EXISTS', ok: true, detail: 'Succeeded' })
  } catch (err) {
    steps.push({ step: 'CREATE TABLE IF NOT EXISTS', ok: false, detail: 'Failed', error: err instanceof Error ? err.message : String(err) })
  }

  // Step 3.5: ALTER TABLE to add missing columns (schema drift fix)
  const colMigrations = [
    `ALTER TABLE "AuditLog" ADD COLUMN category TEXT NOT NULL DEFAULT 'general'`,
    `ALTER TABLE "AuditLog" ADD COLUMN entity TEXT`,
    `ALTER TABLE "AuditLog" ADD COLUMN "entityId" TEXT`,
    `ALTER TABLE "AuditLog" ADD COLUMN "userAgent" TEXT`,
  ]
  const migrationResults: string[] = []
  for (const sql of colMigrations) {
    try {
      await turso.execute({ sql, args: [] })
      migrationResults.push(`Added: ${sql.match(/ADD COLUMN (\S+)/)?.[1]}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      migrationResults.push(`Skip (${msg})`)
    }
  }
  steps.push({ step: 'ALTER TABLE migrations', ok: true, detail: migrationResults.join('; ') })

  // Step 4: Try INSERT a test row
  let testId = ''
  try {
    testId = generateId()
    const now = new Date().toISOString()
    await turso.execute({
      sql: `INSERT INTO "AuditLog" (id, "userId", action, category, entity, "entityId", details, "ipAddress", "userAgent", "createdAt")
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [testId, 'debug-test', 'DEBUG_TEST', 'system', 'AuditLog', testId, 'Diagnostic test entry', '127.0.0.1', 'debug-script', now],
    })
    steps.push({ step: 'INSERT test row', ok: true, detail: `Inserted id=${testId}` })
  } catch (err) {
    steps.push({ step: 'INSERT test row', ok: false, detail: 'FAILED — THIS IS WHY AUDIT LOGS ARE EMPTY', error: err instanceof Error ? err.message : String(err) })
  }

  // Step 5: Try SELECT COUNT without JOIN
  try {
    const result = await turso.execute({ sql: `SELECT COUNT(*) as total FROM "AuditLog"`, args: [] })
    steps.push({ step: 'SELECT COUNT (no JOIN)', ok: true, detail: `Total rows: ${result.rows[0]?.total}` })
  } catch (err) {
    steps.push({ step: 'SELECT COUNT (no JOIN)', ok: false, detail: 'Failed', error: err instanceof Error ? err.message : String(err) })
  }

  // Step 6: Try SELECT with LEFT JOIN User
  try {
    const result = await turso.execute({
      sql: `SELECT a.id, a."userId", a.action, a.category, a."createdAt",
                   u.name as "userName"
            FROM "AuditLog" a
            LEFT JOIN "User" u ON u.id = a."userId"
            ORDER BY a."createdAt" DESC
            LIMIT 10`,
      args: [],
    })
    steps.push({ step: 'SELECT with JOIN', ok: true, detail: `Returned ${result.rows.length} rows` })
  } catch (err) {
    steps.push({ step: 'SELECT with JOIN', ok: false, detail: 'FAILED — JOIN is broken', error: err instanceof Error ? err.message : String(err) })
  }

  // Step 7: Clean up test row
  if (testId) {
    try {
      await turso.execute({ sql: `DELETE FROM "AuditLog" WHERE id = ?`, args: [testId] })
    } catch { /* non-critical */ }
  }

  // Step 8: List all tables
  try {
    const allTables = await turso.execute({ sql: `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`, args: [] })
    steps.push({ step: 'All tables', ok: true, detail: allTables.rows.map(r => r.name as string).join(', ') })
  } catch (err) {
    steps.push({ step: 'All tables', ok: false, detail: 'Failed', error: err instanceof Error ? err.message : String(err) })
  }

  return NextResponse.json({
    tursoActive: true,
    steps,
    summary: {
      allOk: steps.filter(s => !s.ok).length === 0,
      failedSteps: steps.filter(s => !s.ok).map(s => s.step),
    },
  })
}