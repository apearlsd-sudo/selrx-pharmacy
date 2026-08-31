import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute, sqlRaw, toObjs, generateId, safeArgs } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'
import { checkRateLimit, getRetryAfter } from '@/lib/security'

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
    // ── Authentication required ──
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { ipAddress, userAgent } = getRequestContext(request)

    // ── Rate limiting: max 10 claims per user per 60 seconds ──
    const claimRateKey = `insurance-claim:${userId}`
    if (!checkRateLimit(claimRateKey, 10, 60_000)) {
      const retryAfter = getRetryAfter(claimRateKey)
      await writeAuditLog({
        userId, action: 'INSURANCE_CLAIM_RATE_LIMITED', category: 'security',
        entity: 'InsuranceClaim',
        details: { reason: 'rate_limit', retryAfterSeconds: retryAfter }, ipAddress, userAgent,
      })
      return NextResponse.json(
        { error: 'Too many insurance claim attempts', detail: `Please wait ${retryAfter} seconds` },
        { status: 429 },
      )
    }

    const body = await request.json()
    const { transactionId, customerId, insuranceProvider, policyNumber, totalAmount, coPayAmount, prescriptionId } = body

    if (!transactionId) return NextResponse.json({ error: 'transactionId is required' }, { status: 400 })
    if (!customerId) return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    if (totalAmount === undefined || totalAmount === null || typeof totalAmount !== 'number' || totalAmount < 0) {
      return NextResponse.json({ error: 'totalAmount is required and must be a non-negative number' }, { status: 400 })
    }

    // ── Verify the transaction exists, is INSURANCE, and belongs to user ──
    let verifiedAmount = Number(totalAmount)
    if (isTurso()) {
      await ensureTable()
      try {
        const txnResult = await turso.execute(
          sqlRaw(`SELECT id, total, "paymentMethod", "userId" FROM "Transaction" WHERE id = ?`, [transactionId])
        )
        const txnRows = toObjs(txnResult)
        if (txnRows.length === 0) {
          return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
        }
        const txn = txnRows[0]
        if (txn.paymentMethod !== 'INSURANCE') {
          return NextResponse.json({ error: 'Transaction is not an insurance payment' }, { status: 400 })
        }
        if (txn.userId && txn.userId !== userId) {
          await writeAuditLog({
            userId, action: 'INSURANCE_CLAIM_UNAUTHORIZED_TXN', category: 'security',
            entity: 'InsuranceClaim', entityId: transactionId,
            details: { transactionOwner: txn.userId }, ipAddress, userAgent,
          })
          return NextResponse.json({ error: 'Transaction does not belong to this user' }, { status: 403 })
        }
        // Use server-side amount
        verifiedAmount = Number(txn.total)
      } catch (verifyErr) {
        console.warn('[insurance-claims] Transaction verification failed (non-fatal):', verifyErr)
      }
    } else {
      const { db } = await import('@/lib/db')
      try {
        const txn = await db.transaction.findUnique({
          where: { id: transactionId },
          select: { id: true, total: true, paymentMethod: true, userId: true },
        })
        if (!txn) {
          return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
        }
        if (txn.paymentMethod !== 'INSURANCE') {
          return NextResponse.json({ error: 'Transaction is not an insurance payment' }, { status: 400 })
        }
        if (txn.userId && txn.userId !== userId) {
          await writeAuditLog({
            userId, action: 'INSURANCE_CLAIM_UNAUTHORIZED_TXN', category: 'security',
            entity: 'InsuranceClaim', entityId: transactionId,
            details: { transactionOwner: txn.userId }, ipAddress, userAgent,
          })
          return NextResponse.json({ error: 'Transaction does not belong to this user' }, { status: 403 })
        }
        verifiedAmount = txn.total
      } catch (verifyErr) {
        console.warn('[insurance-claims] Transaction verification failed (non-fatal):', verifyErr)
      }
    }

    const id = generateId()
    const now = new Date().toISOString()
    const serverCoPay = Math.max(0, Math.min(Number(coPayAmount ?? 0), verifiedAmount))

    try {
      if (isTurso()) {
        await tursoExecute({
          sql: `INSERT INTO "InsuranceClaim" (id, "transactionId", "customerId", "insuranceProvider", "policyNumber", "totalAmount", "coPayAmount", "prescriptionId", status, "createdBy", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?, ?)`,
          args: safeArgs([id, transactionId, customerId, insuranceProvider || null, policyNumber || null, verifiedAmount, serverCoPay, prescriptionId || null, userId, now, now]),
        })
      } else {
        const { db } = await import('@/lib/db')
        await db.insuranceClaim.create({
          data: {
            id, transactionId, customerId,
            insuranceProvider: insuranceProvider || null,
            policyNumber: policyNumber || null,
            totalAmount: verifiedAmount,
            coPayAmount: serverCoPay,
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
      totalAmount: verifiedAmount, coPayAmount: serverCoPay,
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
