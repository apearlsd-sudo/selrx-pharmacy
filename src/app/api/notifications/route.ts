import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, safeArgs, generateId, toObjs } from '@/lib/turso'

// Valid notification types that are non-user-specific (broadcast)
const BROADCAST_TYPES = ['EXPIRY_ALERT', 'REORDER_ALERT', 'LOW_STOCK', 'SYSTEM']

// Self-healing: ensure the Notification table exists in Turso
let tableEnsured = false
async function ensureTable() {
  if (tableEnsured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "Notification" (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        "entityType" TEXT,
        "entityId" TEXT,
        status TEXT NOT NULL DEFAULT 'UNREAD',
        "userId" TEXT,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        "readAt" TEXT
      )`,
      args: [],
    })

    // Self-healing: try adding columns that may be missing
    const migrations = [
      `ALTER TABLE "Notification" ADD COLUMN "entityType" TEXT`,
      `ALTER TABLE "Notification" ADD COLUMN "entityId" TEXT`,
      `ALTER TABLE "Notification" ADD COLUMN "readAt" TEXT`,
      `ALTER TABLE "Notification" ADD COLUMN "userId" TEXT`,
    ]
    for (const sql of migrations) {
      try { await turso.execute({ sql, args: [] }) } catch { /* duplicate column — ignore */ }
    }

    // Indexes
    await turso.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_notification_user_status" ON "Notification"("userId", status)`, args: [] })
    await turso.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_notification_type" ON "Notification"(type)`, args: [] })
    await turso.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_notification_created" ON "Notification"("createdAt")`, args: [] })

    tableEnsured = true
    console.log('[notifications] Notification table ensured')
  } catch (err) {
    console.error('[notifications] Failed to ensure table:', err)
  }
}

// ---------------------------------------------------------------------------
// GET /api/notifications?type=EXPIRY_ALERT&status=UNREAD&limit=50
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    if (isTurso()) await ensureTable()

    const { searchParams } = request.nextUrl
    const type = searchParams.get('type') || ''
    const status = searchParams.get('status') || ''
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50))
    const userId = request.headers.get('x-user-id') || ''

    if (isTurso()) {
      const conditions: string[] = []
      const args: any[] = []

      // If no userId, only return broadcast (non-user-specific) notifications
      if (!userId) {
        conditions.push(`type IN (${BROADCAST_TYPES.map(() => '?').join(', ')})`)
        args.push(...BROADCAST_TYPES)
      } else {
        // Return broadcast notifications OR notifications for this user
        conditions.push(`("userId" IS NULL OR "userId" = ?)`)
        args.push(userId)
      }

      if (type) {
        conditions.push(`type = ?`)
        args.push(type)
      }
      if (status) {
        conditions.push(`status = ?`)
        args.push(status)
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const safeLimitArgs = safeArgs(args)

      // Build unread count query
      let unreadSql: string
      let unreadArgs: any[]
      if (userId) {
        unreadSql = `SELECT COUNT(*) as cnt FROM "Notification" WHERE status = 'UNREAD' AND ("userId" IS NULL OR "userId" = ?)`
        unreadArgs = [userId]
      } else {
        unreadSql = `SELECT COUNT(*) as cnt FROM "Notification" WHERE status = 'UNREAD' AND type IN (${BROADCAST_TYPES.map(() => '?').join(', ')})`
        unreadArgs = [...BROADCAST_TYPES]
      }

      const [rowsResult, countResult] = await Promise.all([
        turso.execute({
          sql: `SELECT * FROM "Notification" ${where} ORDER BY "createdAt" DESC LIMIT ?`,
          args: [...safeLimitArgs, String(limit)],
        }),
        turso.execute({
          sql: unreadSql,
          args: unreadArgs,
        }),
      ])

      const notifications = toObjs(rowsResult)
      const unreadCount = Number(countResult.rows[0]?.cnt || 0)

      return NextResponse.json({ notifications, unreadCount })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const whereClause: Record<string, unknown> = {}

    if (!userId) {
      whereClause.type = { in: BROADCAST_TYPES }
    } else {
      whereClause.OR = [
        { userId: null },
        { userId },
      ]
    }
    if (type) whereClause.type = type
    if (status) whereClause.status = status

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      db.notification.count({
        where: {
          status: 'UNREAD',
          ...(userId ? { OR: [{ userId: null }, { userId }] } : { type: { in: BROADCAST_TYPES } }),
        },
      }),
    ])

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        entityType: n.entityType,
        entityId: n.entityId,
        status: n.status,
        userId: n.userId,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() || null,
      })),
      unreadCount,
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/notifications — Create notification (SUPER_ADMIN only)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only SUPER_ADMIN can create notifications' }, { status: 403 })
    }

    if (isTurso()) await ensureTable()

    const body = await request.json()
    const { type, title, message, entityType, entityId, userId } = body

    if (!type || !title || !message) {
      return NextResponse.json({ error: 'type, title, and message are required' }, { status: 400 })
    }

    const id = generateId()
    const now = new Date().toISOString()

    if (isTurso()) {
      await turso.execute({
        sql: `INSERT INTO "Notification" (id, type, title, message, "entityType", "entityId", status, "userId", "createdAt")
              VALUES (?, ?, ?, ?, ?, ?, 'UNREAD', ?, ?)`,
        args: safeArgs([id, type, title, message, entityType, entityId, userId || null, now]),
      })

      return NextResponse.json({ id, type, title, message, entityType, entityId, userId, status: 'UNREAD', createdAt: now, readAt: null }, { status: 201 })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const notification = await db.notification.create({
      data: {
        type,
        title,
        message,
        entityType: entityType || null,
        entityId: entityId || null,
        userId: userId || null,
      },
    })

    return NextResponse.json({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      status: notification.status,
      userId: notification.userId,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt?.toISOString() || null,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating notification:', error)
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/notifications — Bulk update notification statuses
// Body: { ids: string[], status: 'READ' | 'DISMISSED' }
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    if (isTurso()) await ensureTable()

    const body = await request.json()
    const { ids, status } = body as { ids: string[]; status: 'READ' | 'DISMISSED' }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
    }
    if (status !== 'READ' && status !== 'DISMISSED') {
      return NextResponse.json({ error: 'status must be READ or DISMISSED' }, { status: 400 })
    }

    if (isTurso()) {
      const now = new Date().toISOString()
      const placeholders = ids.map(() => '?').join(', ')

      if (status === 'READ') {
        await turso.execute({
          sql: `UPDATE "Notification" SET status = 'READ', "readAt" = ? WHERE id IN (${placeholders})`,
          args: [now, ...ids],
        })
      } else {
        await turso.execute({
          sql: `UPDATE "Notification" SET status = 'DISMISSED' WHERE id IN (${placeholders})`,
          args: ids,
        })
      }

      return NextResponse.json({ success: true, updated: ids.length })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const updateData: Record<string, unknown> = { status }
    if (status === 'READ') updateData.readAt = new Date()

    const result = await db.notification.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    })

    return NextResponse.json({ success: true, updated: result.count })
  } catch (error) {
    console.error('Error updating notifications:', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
