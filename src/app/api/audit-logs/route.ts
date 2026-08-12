import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// ---------------------------------------------------------------------------
// GET /api/audit-logs
// Query params: ?page=1&limit=50&category=auth&search=&userId=&from=&to=
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50))
    const offset = (page - 1) * limit
    const category = searchParams.get('category') || ''
    const search = searchParams.get('search') || ''
    const userId = searchParams.get('userId') || ''
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''

    if (isTurso()) {
      // Build dynamic WHERE clause
      const conditions: string[] = []
      const args: (string | null)[] = []

      if (category) {
        conditions.push(`a.category = ?`)
        args.push(category)
      }
      if (userId) {
        conditions.push(`a."userId" = ?`)
        args.push(userId)
      }
      if (from) {
        conditions.push(`a."createdAt" >= ?`)
        args.push(from)
      }
      if (to) {
        conditions.push(`a."createdAt" <= ?`)
        args.push(to + 'T23:59:59')
      }
      if (search) {
        conditions.push(`(a.action LIKE ? OR a.details LIKE ? OR u.name LIKE ? OR u.email LIKE ?)`)
        const term = `%${search}%`
        args.push(term, term, term, term)
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const [countResult, logsResult] = await Promise.all([
        turso.execute({
          sql: `SELECT COUNT(*) as total FROM "AuditLog" a ${where}`,
          args,
        }),
        turso.execute({
          sql: `SELECT a.id, a."userId", a.action, a.category, a.entity, a."entityId",
                       a.details, a."ipAddress", a."createdAt",
                       u.name as "userName", u.email as "userEmail"
                FROM "AuditLog" a
                LEFT JOIN "User" u ON u.id = a."userId"
                ${where}
                ORDER BY a."createdAt" DESC
                LIMIT ? OFFSET ?`,
          args: [...args, String(limit), String(offset)],
        }),
      ])

      const total = Number(countResult.rows[0]?.total || 0)
      const logs = logsResult.rows.map((r) => ({
        id: r.id as string,
        userId: r.userId as string,
        userName: (r.userName as string) || 'System',
        userEmail: (r.userEmail as string) || '',
        action: r.action as string,
        category: r.category as string,
        entity: (r.entity as string) || null,
        entityId: (r.entityId as string) || null,
        details: (r.details as string) || null,
        ipAddress: (r.ipAddress as string) || null,
        createdAt: r.createdAt as string,
      }))

      return NextResponse.json({
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const whereClause: Record<string, unknown> = {}
    if (category) whereClause.category = category
    if (userId) whereClause.userId = userId
    if (from || to) {
      whereClause.createdAt = {}
      if (from) (whereClause.createdAt as Record<string, unknown>).gte = from
      if (to) (whereClause.createdAt as Record<string, unknown>).lte = to + 'T23:59:59'
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where: whereClause,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.auditLog.count({ where: whereClause }),
    ])

    return NextResponse.json({
      logs: logs.map((l) => ({
        id: l.id,
        userId: l.userId,
        userName: l.user?.name || 'System',
        userEmail: l.user?.email || '',
        action: l.action,
        category: l.category || 'general',
        entity: null,
        entityId: null,
        details: l.details,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('Audit logs error:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}
