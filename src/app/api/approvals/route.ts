/**
 * APPROVAL LOG API
 *
 * GET  /api/approvals           — List approval logs. Query: ?entityType=...&?userId=...
 * POST /api/approvals           — Verify supervisor PIN and create approval.
 *                                  Body: { action, entityType, entityId, requesterId, pin }
 */

import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute, generateId } from '@/lib/turso'
import { verifyPassword } from '@/lib/security'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'
import { checkRateLimit } from '@/lib/security'

// ── Self-healing table ──

let ensured = false
async function ensureTable() {
  if (ensured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "ApprovalLog" (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        "entityType" TEXT NOT NULL,
        "entityId" TEXT,
        "requesterId" TEXT NOT NULL,
        "approverId" TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'APPROVED',
        notes TEXT,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    })
    await turso.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_approvallog_entity" ON "ApprovalLog"("entityType", "entityId")`, args: [] })
    await turso.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_approvallog_requester" ON "ApprovalLog"("requesterId")`, args: [] })
    await turso.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_approvallog_created" ON "ApprovalLog"("createdAt")`, args: [] })
    ensured = true
  } catch (err) {
    console.error('[approvals] Failed to ensure table:', err)
  }
}

// ── Valid actions ──

const VALID_ACTIONS = ['PRICE_OVERRIDE', 'REFUND_APPROVAL', 'CONTROLLED_DISPENSE', 'DISCOUNT_OVERRIDE', 'CREDIT_SALE', 'VOID_TRANSACTION'] as const

// ── GET: List approval logs ──

export async function GET(req: NextRequest) {
  try {
    if (isTurso()) await ensureTable()

    const { searchParams } = new URL(req.url)
    const entityType = searchParams.get('entityType') || ''
    const userId = searchParams.get('userId') || ''
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50))
    const offset = (page - 1) * limit

    if (isTurso()) {
      const conditions: string[] = []
      const args: (string | null)[] = []

      if (entityType) { conditions.push(`"entityType" = ?`); args.push(entityType) }
      if (userId) { conditions.push(`"requesterId" = ?`); args.push(userId) }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const [countResult, logsResult] = await Promise.all([
        turso.execute({ sql: `SELECT COUNT(*) as total FROM "ApprovalLog" ${where}`, args }),
        turso.execute({
          sql: `SELECT a.*, r.name as "requesterName", ap.name as "approverName"
                FROM "ApprovalLog" a
                LEFT JOIN "User" r ON r.id = a."requesterId"
                LEFT JOIN "User" ap ON ap.id = a."approverId"
                ${where}
                ORDER BY a."createdAt" DESC
                LIMIT ? OFFSET ?`,
          args: [...args, String(limit), String(offset)],
        }),
      ])

      const total = Number(countResult.rows[0]?.total || 0)
      const logs = logsResult.rows.map((r) => ({
        id: r.id as string,
        action: r.action as string,
        entityType: r.entityType as string,
        entityId: (r.entityId as string) || null,
        requesterId: r.requesterId as string,
        requesterName: (r.requesterName as string) || 'Unknown',
        approverId: r.approverId as string,
        approverName: (r.approverName as string) || 'Unknown',
        status: r.status as string,
        notes: (r.notes as string) || null,
        createdAt: r.createdAt as string,
      }))

      return NextResponse.json({ logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const whereClause: Record<string, unknown> = {}
    if (entityType) whereClause.entityType = entityType
    if (userId) whereClause.requesterId = userId

    const [logs, total] = await Promise.all([
      db.approvalLog.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.approvalLog.count({ where: whereClause }),
    ])

    return NextResponse.json({
      logs: logs.map((l: any) => ({
        ...l,
        createdAt: l.createdAt?.toISOString?.() || l.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[approvals] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch approval logs' }, { status: 500 })
  }
}

// ── POST: Verify PIN and create approval ──

export async function POST(req: NextRequest) {
  try {
    if (isTurso()) await ensureTable()

    const body = await req.json()
    const { action, entityType, entityId, requesterId, pin } = body as {
      action: string
      entityType: string
      entityId?: string
      requesterId: string
      pin: string
    }

    // Validate
    if (!action || !VALID_ACTIONS.includes(action as any)) {
      return NextResponse.json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 })
    }
    if (!entityType) return NextResponse.json({ error: 'entityType is required' }, { status: 400 })
    if (!requesterId) return NextResponse.json({ error: 'requesterId is required' }, { status: 400 })
    if (!pin || pin.trim().length === 0) return NextResponse.json({ error: 'PIN is required' }, { status: 400 })

    // Rate limit: max 5 attempts per minute per requester
    const rlKey = `approval:${requesterId}`
    if (!checkRateLimit(rlKey, 5, 60_000)) {
      return NextResponse.json({ error: 'Too many PIN attempts. Please wait a minute.' }, { status: 429 })
    }

    // Resolve who approved: for REFUND_APPROVAL, try the requester's own PIN first
    let approver: { id: string; password: string; name: string; pinCode?: string | null } | null = null
    let approvalSource: 'user_pin' | 'admin_password' | null = null

    // Step 1: For REFUND_APPROVAL, check if the requester has a user PIN set
    if (action === 'REFUND_APPROVAL') {
      if (isTurso()) {
        const result = await turso.execute({
          sql: `SELECT id, name, password, pinCode FROM "User" WHERE id = ? AND active = 1`,
          args: [requesterId],
        })
        if (result.rows.length > 0) {
          const row = result.rows[0]
          approver = {
            id: row.id as string,
            name: row.name as string,
            password: (row.password as string) || '',
            pinCode: (row.pinCode as string) || null,
          }
        }
      } else {
        const { db } = await import('@/lib/db')
        const user = await db.user.findUnique({ where: { id: requesterId } })
        if (user && user.active) {
          approver = { id: user.id, name: user.name, password: user.password || '', pinCode: user.pinCode }
        }
      }

      // If the requester has a PIN set, verify against it
      if (approver?.pinCode) {
        const { valid } = await verifyPassword(pin.trim(), approver.pinCode)
        if (valid) {
          approvalSource = 'user_pin'
        }
      }
    }

    // Step 2: If user PIN didn't match (or not a REFUND_APPROVAL), fall back to SUPER_ADMIN password
    if (!approvalSource) {
      if (isTurso()) {
        const result = await turso.execute({
          sql: `SELECT id, name, password FROM "User" WHERE role = 'SUPER_ADMIN' AND active = 1 LIMIT 1`,
          args: [],
        })
        if (result.rows.length > 0) {
          approver = {
            id: result.rows[0].id as string,
            name: result.rows[0].name as string,
            password: (result.rows[0].password as string) || '',
          }
        }
      } else {
        const { db } = await import('@/lib/db')
        const user = await db.user.findFirst({ where: { role: 'SUPER_ADMIN', active: true } })
        if (user) {
          approver = { id: user.id, name: user.name, password: user.password || '' }
        }
      }

      if (!approver) {
        return NextResponse.json({ error: 'No SUPER_ADMIN account found. Cannot verify PIN.' }, { status: 403 })
      }

      const { valid } = await verifyPassword(pin.trim(), approver.password)
      if (!valid) {
        return NextResponse.json({ error: 'Invalid PIN. Access denied.' }, { status: 403 })
      }
      approvalSource = 'admin_password'
    }

    if (!approver) {
      return NextResponse.json({ error: 'No approver found.' }, { status: 403 })
    }

    // Create approval log
    const id = generateId()
    const now = new Date().toISOString()

    if (isTurso()) {
      await turso.execute({
        sql: `INSERT INTO "ApprovalLog" (id, action, "entityType", "entityId", "requesterId", "approverId", status, "createdAt")
              VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', ?)`,
        args: [id, action, entityType, entityId || null, requesterId, approver.id, now],
      })
    } else {
      const { db } = await import('@/lib/db')
      await db.approvalLog.create({
        data: {
          action,
          entityType,
          entityId: entityId || null,
          requesterId,
          approverId: approver.id,
          status: 'APPROVED',
        },
      })
    }

    // Audit log
    const { userId, ipAddress, userAgent } = getRequestContext(req)
    await writeAuditLog({
      userId,
      action: `APPROVAL_${action}`,
      category: 'general',
      entity: entityType,
      entityId: entityId || null,
      details: { requesterId, approverId: approver.id, approvalSource },
      ipAddress,
      userAgent,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      approval: { id, action, entityType, entityId, requesterId, approverId: approver.id, approverName: approver.name, status: 'APPROVED', createdAt: now, approvalSource },
    })
  } catch (error) {
    console.error('[approvals] POST error:', error)
    return NextResponse.json({ error: 'Approval verification failed' }, { status: 500 })
  }
}
