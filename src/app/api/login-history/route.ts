import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute } from '@/lib/turso'

// ---------------------------------------------------------------------------
// GET /api/login-history
// Query params: ?page=1&limit=25&userId=&action=&startDate=&endDate=
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const requesterRole = request.headers.get('x-user-role') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 25))
    const userIdFilter = searchParams.get('userId') || ''
    const actionFilter = searchParams.get('action') || ''
    const startDate = searchParams.get('startDate') || ''
    const endDate = searchParams.get('endDate') || ''

    if (isTurso()) {
      const conditions: string[] = ["al.action IN ('LOGIN_SUCCESS', 'LOGIN_FAILED')"]
      const args: (string | number)[] = []

      if (!isSuperAdmin) {
        conditions.push('al."userId" = ?')
        args.push(userId)
      }
      if (userIdFilter) {
        conditions.push('al."userId" = ?')
        args.push(userIdFilter)
      }
      if (actionFilter) {
        conditions.push('al.action = ?')
        args.push(actionFilter)
      }
      if (startDate) {
        conditions.push('al."createdAt" >= ?')
        args.push(startDate)
      }
      if (endDate) {
        conditions.push('al."createdAt" <= ?')
        args.push(endDate + 'T23:59:59')
      }

      const whereClause = conditions.join(' AND ')
      const offset = (page - 1) * limit

      // Count + data in parallel
      const [countResult, result] = await Promise.all([
        tursoExecute({
          sql: `SELECT COUNT(*) as total FROM AuditLog al WHERE ${whereClause}`,
          args,
        }),
        tursoExecute({
          sql: `SELECT al.id, al."userId", al.action, al."ipAddress", al."userAgent", al."createdAt",
                       al.details, u.name as "userName", u.email as "userEmail"
                FROM AuditLog al
                LEFT JOIN User u ON al."userId" = u.id
                WHERE ${whereClause}
                ORDER BY al."createdAt" DESC
                LIMIT ? OFFSET ?`,
          args: [...args, limit, offset],
        }),
      ])

      const total = Number(countResult.rows[0][0]) || 0

      const columns = result.columns
      const entries = result.rows.map((row) => {
        const obj: Record<string, unknown> = {}
        columns.forEach((c, i) => { obj[c] = row[i] })
        return obj
      })

      return NextResponse.json({
        entries,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const where: Record<string, unknown> = { action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] } }

    if (!isSuperAdmin) where.userId = userId
    if (userIdFilter) where.userId = userIdFilter
    if (actionFilter) where.action = actionFilter
    if (startDate || endDate) {
      where.createdAt = {} as Record<string, unknown>
      if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate)
      if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate + 'T23:59:59')
    }

    const skip = (page - 1) * limit
    const [entries, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      db.auditLog.count({ where }),
    ])

    return NextResponse.json({
      entries,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('Error fetching login history:', error)
    return NextResponse.json({ error: 'Failed to fetch login history' }, { status: 500 })
  }
}
