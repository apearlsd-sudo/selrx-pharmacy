/**
 * CONTROLLED SUBSTANCE TRACKING API
 *
 * GET  /api/controlled-substances                  — List all CS dispensing events. Query: ?from=...&to=...
 * POST /api/controlled-substances                  — Record a dispensing event (two-person rule)
 */

import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute, generateId } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ── Self-healing table ──

let ensured = false
async function ensureTable() {
  if (ensured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "ControlledSubstanceLog" (
        id TEXT PRIMARY KEY,
        "productId" TEXT NOT NULL,
        "productName" TEXT,
        "prescriptionId" TEXT,
        quantity INTEGER NOT NULL,
        "dispensedBy" TEXT NOT NULL,
        "verifiedBy" TEXT NOT NULL,
        notes TEXT,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
      args: [],
    })
    await turso.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_cslog_product" ON "ControlledSubstanceLog"("productId")`, args: [] })
    await turso.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_cslog_created" ON "ControlledSubstanceLog"("createdAt")`, args: [] })
    await turso.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_cslog_dispenser" ON "ControlledSubstanceLog"("dispensedBy")`, args: [] })
    ensured = true
  } catch (err) {
    console.error('[controlled-substances] Failed to ensure table:', err)
  }
}

// ── GET: List dispensing events ──

export async function GET(req: NextRequest) {
  try {
    if (isTurso()) await ensureTable()

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50))
    const offset = (page - 1) * limit

    if (isTurso()) {
      const conditions: string[] = []
      const args: (string | null)[] = []

      if (from) { conditions.push(`c."createdAt" >= ?`); args.push(from) }
      if (to) { conditions.push(`c."createdAt" <= ?`); args.push(to + 'T23:59:59') }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const [countResult, logsResult] = await Promise.all([
        turso.execute({ sql: `SELECT COUNT(*) as total FROM "ControlledSubstanceLog" c ${where}`, args }),
        turso.execute({
          sql: `SELECT c.*, d.name as "dispenserName", v.name as "verifierName", p.name as "productName"
                FROM "ControlledSubstanceLog" c
                LEFT JOIN "User" d ON d.id = c."dispensedBy"
                LEFT JOIN "User" v ON v.id = c."verifiedBy"
                LEFT JOIN "Product" p ON p.id = c."productId"
                ${where}
                ORDER BY c."createdAt" DESC
                LIMIT ? OFFSET ?`,
          args: [...args, String(limit), String(offset)],
        }),
      ])

      const total = Number(countResult.rows[0]?.total || 0)
      const logs = logsResult.rows.map((r) => ({
        id: r.id as string,
        productId: r.productId as string,
        productName: (r.productName as string) || (r.product_name as string) || '',
        prescriptionId: (r.prescriptionId as string) || null,
        quantity: Number(r.quantity),
        dispensedBy: r.dispensedBy as string,
        dispenserName: (r.dispenserName as string) || 'Unknown',
        verifiedBy: r.verifiedBy as string,
        verifierName: (r.verifierName as string) || 'Unknown',
        notes: (r.notes as string) || null,
        createdAt: r.createdAt as string,
      }))

      return NextResponse.json({ logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const whereClause: Record<string, unknown> = {}
    if (from || to) {
      whereClause.createdAt = {}
      if (from) (whereClause.createdAt as Record<string, unknown>).gte = from
      if (to) (whereClause.createdAt as Record<string, unknown>).lte = to + 'T23:59:59'
    }

    const [logs, total] = await Promise.all([
      db.controlledSubstanceLog.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { dispenser: { select: { name: true } }, verifier: { select: { name: true } }, product: { select: { name: true } } },
      }),
      db.controlledSubstanceLog.count({ where: whereClause }),
    ])

    return NextResponse.json({
      logs: logs.map((l: any) => ({
        ...l,
        dispenserName: l.dispenser?.name || 'Unknown',
        verifierName: l.verifier?.name || 'Unknown',
        productName: l.product?.name || l.productName || '',
        createdAt: l.createdAt?.toISOString?.() || l.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[controlled-substances] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch controlled substance logs' }, { status: 500 })
  }
}

// ── POST: Record a dispensing event ──

export async function POST(req: NextRequest) {
  try {
    if (isTurso()) await ensureTable()

    const body = await req.json()
    const { productId, prescriptionId, quantity, dispensedBy, verifiedBy, notes } = body as {
      productId: string
      prescriptionId?: string
      quantity: number
      dispensedBy: string
      verifiedBy: string
      notes?: string
    }

    if (!productId || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'productId and a positive quantity are required' }, { status: 400 })
    }
    if (!dispensedBy || !verifiedBy) {
      return NextResponse.json({ error: 'Both dispensedBy and verifiedBy are required (two-person rule)' }, { status: 400 })
    }
    if (dispensedBy === verifiedBy) {
      return NextResponse.json({ error: 'Dispenser and verifier must be different users' }, { status: 400 })
    }

    // Fetch product name for the log
    let productName = ''
    try {
      if (isTurso()) {
        const pResult = await turso.execute({ sql: `SELECT name FROM "Product" WHERE id = ?`, args: [productId] })
        productName = (pResult.rows[0]?.name as string) || ''
      } else {
        const { db } = await import('@/lib/db')
        const prod = await db.product.findUnique({ where: { id: productId }, select: { name: true } })
        productName = prod?.name || ''
      }
    } catch { /* non-critical */ }

    const id = generateId()
    const now = new Date().toISOString()

    if (isTurso()) {
      await turso.execute({
        sql: `INSERT INTO "ControlledSubstanceLog" (id, "productId", "productName", "prescriptionId", quantity, "dispensedBy", "verifiedBy", notes, "createdAt")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, productId, productName || null, prescriptionId || null, String(quantity), dispensedBy, verifiedBy, notes || null, now],
      })
    } else {
      const { db } = await import('@/lib/db')
      await db.controlledSubstanceLog.create({
        data: { productId, productName, prescriptionId, quantity, dispensedBy, verifiedBy, notes, createdAt: now },
      })
    }

    const { userId, ipAddress, userAgent } = getRequestContext(req)
    await writeAuditLog({
      userId,
      action: 'CONTROLLED_SUBSTANCE_DISPENSED',
      category: 'prescription',
      entity: 'ControlledSubstanceLog',
      entityId: id,
      details: { productId, productName, quantity, dispensedBy, verifiedBy },
      ipAddress,
      userAgent,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      log: { id, productId, productName, prescriptionId, quantity, dispensedBy, verifiedBy, notes, createdAt: now },
    })
  } catch (error) {
    console.error('[controlled-substances] POST error:', error)
    return NextResponse.json({ error: 'Failed to record controlled substance dispensing' }, { status: 500 })
  }
}
