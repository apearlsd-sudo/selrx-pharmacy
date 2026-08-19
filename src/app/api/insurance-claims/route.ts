import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute, generateId, safeArgs } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ── Ensure InsuranceClaim table exists (Turso path, idempotent) ──
let tableEnsured = false
async function ensureTable() {
  if (tableEnsured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "InsuranceClaim" (
        id                   TEXT PRIMARY KEY,
        "transactionId"     TEXT NOT NULL,
        "customerId"        TEXT NOT NULL,
        "insuranceProvider"  TEXT,
        "policyNumber"      TEXT,
        "totalAmount"        REAL NOT NULL DEFAULT 0,
        "coPayAmount"        REAL NOT NULL DEFAULT 0,
        "prescriptionId"    TEXT,
        status               TEXT NOT NULL DEFAULT 'SUBMITTED',
        "approvedAmount"    REAL,
        "rejectionReason"    TEXT,
        notes                TEXT,
        "createdBy"         TEXT,
        "createdAt"         TEXT NOT NULL DEFAULT (datetime('now')),
        "updatedAt"         TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_InsuranceClaim_customerId" ON "InsuranceClaim"("customerId")`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_InsuranceClaim_transactionId" ON "InsuranceClaim"("transactionId")`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_InsuranceClaim_status" ON "InsuranceClaim"(status)`,
      args: [],
    })
    tableEnsured = true
    console.log('[insurance-claims] InsuranceClaim table ensured')
  } catch (err) {
    console.error('[insurance-claims] Failed to ensure table:', err)
  }
}

// ── Helpers ──

function mapRow(row: any) {
  return {
    id: row.id,
    transactionId: row.transactionId,
    customerId: row.customerId,
    insuranceProvider: row.insuranceProvider || null,
    policyNumber: row.policyNumber || null,
    totalAmount: Number(row.totalAmount),
    coPayAmount: Number(row.coPayAmount ?? 0),
    prescriptionId: row.prescriptionId || null,
    status: row.status,
    approvedAmount: row.approvedAmount !== null ? Number(row.approvedAmount) : null,
    rejectionReason: row.rejectionReason || null,
    notes: row.notes || null,
    createdBy: row.createdBy || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ── GET /api/insurance-claims ──
// ?customerId=... ?status=...

export async function GET(request: NextRequest) {
  try {
    if (isTurso()) await ensureTable()

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    const status = searchParams.get('status')

    let whereClause = ''
    const args: any[] = []
    if (customerId) { whereClause += `WHERE "customerId" = ?`; args.push(customerId) }
    if (status) { whereClause += whereClause ? ' AND' : 'WHERE'; whereClause += ` status = ?`; args.push(status) }

    if (isTurso()) {
      const sql = `SELECT ic.*, c."firstName", c."lastName"
                   FROM "InsuranceClaim" ic
                   LEFT JOIN "Customer" c ON c.id = ic."customerId"
                   ${whereClause} ORDER BY ic."createdAt" DESC LIMIT 200`
      const result = await tursoExecute({ sql, args })
      return NextResponse.json(result.rows.map((row: any) => ({
        ...mapRow(row),
        customerName: row.firstName && row.lastName ? `${row.firstName} ${row.lastName}` : 'Unknown',
      })))
    } else {
      const { db } = await import('@/lib/db')
      const where: any = {}
      if (customerId) where.customerId = customerId
      if (status) where.status = status
      const claims = await db.insuranceClaim.findMany({
        where,
        include: { customer: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return NextResponse.json(claims.map(c => ({
        ...c,
        totalAmount: Number(c.totalAmount),
        coPayAmount: Number(c.coPayAmount),
        approvedAmount: c.approvedAmount !== null ? Number(c.approvedAmount) : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        customerName: c.customer ? `${c.customer.firstName} ${c.customer.lastName}` : 'Unknown',
      })))
    }
  } catch (error) {
    console.error('Error fetching insurance claims:', error)
    return NextResponse.json({ error: 'Failed to fetch insurance claims' }, { status: 500 })
  }
}

// ── POST /api/insurance-claims ──
// Body: { transactionId, customerId, insuranceProvider, policyNumber, totalAmount, coPayAmount, prescriptionId? }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { transactionId, customerId, insuranceProvider, policyNumber, totalAmount, coPayAmount, prescriptionId } = body

    if (!transactionId) return NextResponse.json({ error: 'transactionId is required' }, { status: 400 })
    if (!customerId) return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    if (totalAmount === undefined || totalAmount === null) return NextResponse.json({ error: 'totalAmount is required' }, { status: 400 })

    if (isTurso()) await ensureTable()

    const userId = request.headers.get('x-user-id') || null
    const id = generateId()
    const now = new Date().toISOString()

    try {
      if (isTurso()) {
        await tursoExecute({
          sql: `INSERT INTO "InsuranceClaim" (id, "transactionId", "customerId", "insuranceProvider", "policyNumber", "totalAmount", "coPayAmount", "prescriptionId", status, "createdBy", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?, ?)`,
          args: safeArgs([id, transactionId, customerId, insuranceProvider || null, policyNumber || null, Number(totalAmount), Number(coPayAmount ?? 0), prescriptionId || null, userId, now, now]),
        })
      } else {
        const { db } = await import('@/lib/db')
        await db.insuranceClaim.create({
          data: {
            id, transactionId, customerId,
            insuranceProvider: insuranceProvider || null,
            policyNumber: policyNumber || null,
            totalAmount: Number(totalAmount),
            coPayAmount: Number(coPayAmount ?? 0),
            prescriptionId: prescriptionId || null,
            status: 'SUBMITTED',
            createdBy: userId,
          },
        })
      }
    } catch (err) {
      console.error('Error creating insurance claim:', err)
      return NextResponse.json({ error: 'Failed to create insurance claim' }, { status: 500 })
    }

    const { ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({
      userId: userId || undefined,
      action: 'INSURANCE_CLAIM_CREATED',
      category: 'transaction',
      entity: 'InsuranceClaim',
      entityId: id,
      details: { transactionId, customerId, totalAmount, coPayAmount, insuranceProvider },
      ipAddress,
      userAgent,
    }).catch(() => {})

    return NextResponse.json({
      id, transactionId, customerId, insuranceProvider, policyNumber,
      totalAmount: Number(totalAmount), coPayAmount: Number(coPayAmount ?? 0),
      prescriptionId: prescriptionId || null,
      status: 'SUBMITTED',
      createdBy: userId,
      createdAt: now,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating insurance claim:', error)
    return NextResponse.json({ error: 'Failed to create insurance claim' }, { status: 500 })
  }
}

// ── PATCH /api/insurance-claims ──
// Body: { id, status, approvedAmount?, rejectionReason?, notes? }

export async function PATCH(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only SUPER_ADMIN can update claims' }, { status: 403 })
    }

    const body = await request.json()
    const { id, status, approvedAmount, rejectionReason, notes } = body

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (!status || !['SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status. Use: SUBMITTED, APPROVED, PARTIALLY_APPROVED, REJECTED, PAID' }, { status: 400 })
    }

    if (isTurso()) await ensureTable()

    const userId = request.headers.get('x-user-id') || null
    const now = new Date().toISOString()

    // Validate: if rejecting, reason required
    if (status === 'REJECTED' && !rejectionReason) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 })
    }

    try {
      if (isTurso()) {
        await tursoExecute({
          sql: `UPDATE "InsuranceClaim" SET status = ?, "approvedAmount" = ?, "rejectionReason" = ?, notes = ?, "updatedAt" = ? WHERE id = ?`,
          args: safeArgs([status, approvedAmount !== undefined ? Number(approvedAmount) : null, rejectionReason || null, notes || null, now, id]),
        })
      } else {
        const { db } = await import('@/lib/db')
        const updateData: any = { status, updatedAt: new Date() }
        if (approvedAmount !== undefined) updateData.approvedAmount = Number(approvedAmount)
        if (rejectionReason) updateData.rejectionReason = rejectionReason
        if (notes) updateData.notes = notes
        await db.insuranceClaim.update({ where: { id }, data: updateData })
      }
    } catch (err) {
      console.error('Error updating insurance claim:', err)
      return NextResponse.json({ error: 'Failed to update insurance claim' }, { status: 500 })
    }

    const { ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({
      userId: userId || undefined,
      action: `INSURANCE_CLAIM_${status}`,
      category: 'transaction',
      entity: 'InsuranceClaim',
      entityId: id,
      details: { status, approvedAmount, rejectionReason, notes },
      ipAddress,
      userAgent,
    }).catch(() => {})

    return NextResponse.json({ success: true, id, status })
  } catch (error) {
    console.error('Error updating insurance claim:', error)
    return NextResponse.json({ error: 'Failed to update insurance claim' }, { status: 500 })
  }
}
