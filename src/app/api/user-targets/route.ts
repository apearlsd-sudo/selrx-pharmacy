import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute, generateId, safeArgs } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ── Ensure UserTarget table exists (Turso path, idempotent) ──
let tableEnsured = false
async function ensureTable() {
  if (tableEnsured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "UserTarget" (
        id           TEXT PRIMARY KEY,
        "userId"     TEXT NOT NULL,
        period       TEXT NOT NULL,
        "targetType" TEXT NOT NULL,
        "targetValue" REAL NOT NULL DEFAULT 0,
        "createdAt"  TEXT NOT NULL DEFAULT (datetime('now')),
        "updatedAt"  TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE("userId", period, "targetType")
        )`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_UserTarget_userId" ON "UserTarget"("userId")`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_UserTarget_period" ON "UserTarget"(period)`,
      args: [],
    })
    tableEnsured = true
    console.log('[user-targets] UserTarget table ensured')
  } catch (err) {
    console.error('[user-targets] Failed to ensure table:', err)
  }
}

// ── Helpers ──

function mapRow(row: any) {
  return {
    id: row.id,
    userId: row.userId,
    period: row.period,
    targetType: row.targetType,
    targetValue: Number(row.targetValue),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ── GET /api/user-targets ──
// ?userId=... → targets for a user
// ?period=2026-08 → targets for a period
// ?progress=true → each user's progress against targets for current period

export async function GET(request: NextRequest) {
  try {
    if (isTurso()) await ensureTable()

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const period = searchParams.get('period')
    const progress = searchParams.get('progress') === 'true'

    // ── Progress endpoint: returns each user's actual vs target for current period ──
    if (progress) {
      const targetPeriod = period || new Date().toISOString().slice(0, 7) // e.g. '2026-08'
      const periodStart = `${targetPeriod}-01T00:00:00.000Z`
      // Calculate end of month
      const [year, month] = targetPeriod.split('-').map(Number)
      const lastDay = new Date(year!, month!, 0).getDate()
      const periodEnd = `${targetPeriod}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`

      // Get all targets for the period
      let targets: any[] = []
      if (isTurso()) {
        const result = await tursoExecute({
          sql: `SELECT ut.*, u.name as "userName", u.email as "userEmail", u.role as "userRole"
                FROM "UserTarget" ut
                LEFT JOIN "User" u ON u.id = ut."userId"
                WHERE ut.period = ?`,
          args: [targetPeriod],
        })
        targets = result.rows.map((row: any) => ({
          ...mapRow(row),
          userName: row.userName || 'Unknown',
          userEmail: row.userEmail || '',
          userRole: row.userRole || '',
        }))
      } else {
        const { db } = await import('@/lib/db')
        const dbTargets = await db.userTarget.findMany({
          where: { period: targetPeriod },
          include: { user: { select: { name: true, email: true, role: true } } },
        })
        targets = dbTargets.map(t => ({
          ...t,
          targetValue: Number(t.targetValue),
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          userName: t.user?.name || 'Unknown',
          userEmail: t.user?.email || '',
          userRole: t.user?.role || '',
        }))
      }

      // Get actual performance for each user in the period
      const userActuals: Record<string, { totalSales: number; transactionCount: number }> = {}
      if (isTurso()) {
        const result = await tursoExecute({
          sql: `SELECT "userId",
                COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total ELSE 0 END), 0) as totalSales,
                COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as transactionCount
              FROM "Transaction"
              WHERE "createdAt" >= ? AND "createdAt" <= ? AND status = 'COMPLETED'
              GROUP BY "userId"`,
          args: [periodStart, periodEnd],
        })
        for (const row of result.rows) {
          userActuals[row.userId as string] = {
            totalSales: Number(row.totalSales),
            transactionCount: Number(row.transactionCount),
          }
        }
      } else {
        const { db } = await import('@/lib/db')
        const salesData = await db.transaction.groupBy({
          by: ['userId'],
          where: {
            status: 'COMPLETED',
            createdAt: { gte: new Date(periodStart), lte: new Date(periodEnd) },
          },
          _sum: { total: true },
          _count: true,
        })
        for (const d of salesData) {
          userActuals[d.userId] = {
            totalSales: Number(d._sum.total ?? 0),
            transactionCount: d._count,
          }
        }
      }

      // Build progress data
      const progressData = targets.map(t => {
        const actual = userActuals[t.userId] || { totalSales: 0, transactionCount: 0 }
        const actualValue = t.targetType === 'SALES_AMOUNT' ? actual.totalSales : actual.transactionCount
        const pct = t.targetValue > 0 ? Math.min(100, Math.round((actualValue / t.targetValue) * 100)) : 0
        return {
          ...t,
          actualValue,
          percentage: pct,
        }
      })

      return NextResponse.json({ period: targetPeriod, targets: progressData })
    }

    // ── Standard list endpoint ──
    let whereClause = ''
    const args: any[] = []
    if (userId) { whereClause += `WHERE "userId" = ?`; args.push(userId) }
    if (period) { whereClause += whereClause ? ' AND' : 'WHERE'; whereClause += ` period = ?`; args.push(period) }

    if (isTurso()) {
      const sql = `SELECT ut.*, u.name as "userName", u.email as "userEmail", u.role as "userRole"
                   FROM "UserTarget" ut
                   LEFT JOIN "User" u ON u.id = ut."userId"
                   ${whereClause} ORDER BY ut."createdAt" DESC LIMIT 200`
      const result = await tursoExecute({ sql, args })
      return NextResponse.json(result.rows.map((row: any) => ({
        ...mapRow(row),
        userName: row.userName || 'Unknown',
        userEmail: row.userEmail || '',
        userRole: row.userRole || '',
      })))
    } else {
      const { db } = await import('@/lib/db')
      const where: any = {}
      if (userId) where.userId = userId
      if (period) where.period = period
      const dbTargets = await db.userTarget.findMany({
        where,
        include: { user: { select: { name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return NextResponse.json(dbTargets.map(t => ({
        ...t,
        targetValue: Number(t.targetValue),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        userName: t.user?.name || 'Unknown',
        userEmail: t.user?.email || '',
        userRole: t.user?.role || '',
      })))
    }
  } catch (error) {
    console.error('Error fetching user targets:', error)
    return NextResponse.json({ error: 'Failed to fetch user targets' }, { status: 500 })
  }
}

// ── POST /api/user-targets ──
// Body: { userId, period, targetType, targetValue }
// Creates or updates (upsert) a target

export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only SUPER_ADMIN can manage targets' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, period, targetType, targetValue } = body

    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    if (!period) return NextResponse.json({ error: 'period is required (e.g. 2026-08)' }, { status: 400 })
    if (!targetType || !['SALES_AMOUNT', 'TRANSACTIONS_COUNT'].includes(targetType)) {
      return NextResponse.json({ error: 'targetType must be SALES_AMOUNT or TRANSACTIONS_COUNT' }, { status: 400 })
    }
    if (targetValue === undefined || targetValue === null || Number(targetValue) < 0) {
      return NextResponse.json({ error: 'targetValue must be a non-negative number' }, { status: 400 })
    }

    if (isTurso()) await ensureTable()

    const userIdHeader = request.headers.get('x-user-id') || null
    const now = new Date().toISOString()
    const numericValue = Number(targetValue)

    try {
      if (isTurso()) {
        // Upsert: insert or update
        await tursoExecute({
          sql: `INSERT INTO "UserTarget" (id, "userId", period, "targetType", "targetValue", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("userId", period, "targetType") DO UPDATE SET
                  "targetValue" = excluded."targetValue",
                  "updatedAt" = excluded."updatedAt"`,
          args: safeArgs([generateId(), userId, period, targetType, numericValue, now, now]),
        })
      } else {
        const { db } = await import('@/lib/db')
        await db.userTarget.upsert({
          where: { userId_period_targetType: { userId, period, targetType } },
          create: { userId, period, targetType, targetValue: numericValue },
          update: { targetValue: numericValue },
        })
      }
    } catch (err) {
      console.error('Error upserting user target:', err)
      return NextResponse.json({ error: 'Failed to save user target' }, { status: 500 })
    }

    const { ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({
      userId: userIdHeader || undefined,
      action: 'USER_TARGET_SET',
      category: 'user',
      entity: 'UserTarget',
      details: { targetUserId: userId, period, targetType, targetValue: numericValue },
      ipAddress,
      userAgent,
    }).catch(() => {})

    return NextResponse.json({ success: true, userId, period, targetType, targetValue: numericValue }, { status: 201 })
  } catch (error) {
    console.error('Error creating user target:', error)
    return NextResponse.json({ error: 'Failed to create user target' }, { status: 500 })
  }
}
