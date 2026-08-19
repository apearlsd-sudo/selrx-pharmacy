/**
 * NOTIFICATION SEND API (Stub)
 *
 * POST /api/notifications/send — Queue a notification for sending.
 *   Body: { customerId, type ('REFILL_REMINDER'|'CREDIT_DUE'|'PRESCRIPTION_READY'|'PROMOTIONAL'), message }
 *
 * The actual SMS/WhatsApp sending is a placeholder (logs to console)
 * since external SMS APIs require service configuration.
 */

import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ── Self-healing table ──

let ensured = false
async function ensureTable() {
  if (ensured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "Notification" (
        id TEXT PRIMARY KEY,
        "customerId" TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'QUEUED',
        "sentVia" TEXT DEFAULT 'CONSOLE',
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
      args: [],
    })
    await turso.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_notif_customer" ON "Notification"("customerId")`, args: [] })
    await turso.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_notif_created" ON "Notification"("createdAt")`, args: [] })
    ensured = true
  } catch (err) {
    console.error('[notifications/send] Failed to ensure table:', err)
  }
}

const VALID_TYPES = ['REFILL_REMINDER', 'CREDIT_DUE', 'PRESCRIPTION_READY', 'PROMOTIONAL'] as const

export async function POST(req: NextRequest) {
  try {
    if (isTurso()) await ensureTable()

    const body = await req.json()
    const { customerId, type, message } = body as {
      customerId: string
      type: string
      message: string
    }

    if (!customerId) return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    if (!type || !VALID_TYPES.includes(type as any)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
    }
    if (!message || !message.trim()) return NextResponse.json({ error: 'message is required' }, { status: 400 })

    const id = generateId()
    const now = new Date().toISOString()

    // Store notification record
    if (isTurso()) {
      await turso.execute({
        sql: `INSERT INTO "Notification" (id, "customerId", type, message, status, "sentVia", "createdAt") VALUES (?, ?, ?, ?, 'SENT', 'CONSOLE', ?)`,
        args: [id, customerId, type, message.trim(), now],
      })
    } else {
      const { db } = await import('@/lib/db')
      await db.notification.create({
        data: { customerId, type, message: message.trim(), status: 'SENT', sentVia: 'CONSOLE' },
      })
    }

    // STUB: Log the notification (actual SMS/WhatsApp integration would go here)
    console.log(`[notification] STUB: ${type} to customer ${customerId}: ${message.trim()}`)

    // Audit
    const { userId, ipAddress, userAgent } = getRequestContext(req)
    await writeAuditLog({
      userId, action: 'NOTIFICATION_SENT', category: 'general', entity: 'Notification', entityId: id,
      details: { customerId, type, sentVia: 'CONSOLE' }, ipAddress, userAgent,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      notification: { id, customerId, type, message: message.trim(), status: 'SENT', sentVia: 'CONSOLE', createdAt: now },
      note: 'Notification recorded. Actual SMS/WhatsApp delivery requires external service configuration.',
    })
  } catch (error) {
    console.error('[notifications/send] POST error:', error)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
