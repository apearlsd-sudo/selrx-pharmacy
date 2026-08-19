import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute, generateId, safeArgs } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ── Ensure CustomerCredit table exists (Turso path, idempotent) ──
let tableEnsured = false
async function ensureTable() {
  if (tableEnsured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "CustomerCredit" (
        id              TEXT PRIMARY KEY,
        "customerId"    TEXT NOT NULL,
        "transactionId" TEXT,
        amount          REAL NOT NULL,
        balance         REAL NOT NULL DEFAULT 0,
        description     TEXT,
        "createdBy"     TEXT,
        "createdAt"     TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_CustomerCredit_customerId" ON "CustomerCredit"("customerId")`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_CustomerCredit_transactionId" ON "CustomerCredit"("transactionId")`,
      args: [],
    })
    tableEnsured = true
    console.log('[customer-credits] CustomerCredit table ensured')
  } catch (err) {
    console.error('[customer-credits] Failed to ensure table:', err)
  }
}

// ── Helpers ──

function mapRow(row: any) {
  return {
    id: row.id,
    customerId: row.customerId,
    transactionId: row.transactionId || null,
    amount: Number(row.amount),
    balance: Number(row.balance ?? 0),
    description: row.description || null,
    createdBy: row.createdBy || null,
    createdAt: row.createdAt,
  }
}

async function getRunningBalance(customerId: string): Promise<number> {
  if (isTurso()) {
    const result = await tursoExecute({
      sql: `SELECT COALESCE(SUM(amount), 0) as total FROM "CustomerCredit" WHERE "customerId" = ?`,
      args: [customerId],
    })
    return Number(result.rows[0]?.total ?? 0)
  } else {
    const { db } = await import('@/lib/db')
    const agg = await db.customerCredit.aggregate({
      where: { customerId },
      _sum: { amount: true },
    })
    return Number(agg._sum.amount ?? 0)
  }
}

// ── GET /api/customer-credits ──
// ?customerId=...  → ledger for a customer
// ?outstanding=true → customers with balance > 0
// ?action=summary&customerId=... → summary endpoint

export async function GET(request: NextRequest) {
  try {
    if (isTurso()) await ensureTable()

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    const outstanding = searchParams.get('outstanding') === 'true'
    const action = searchParams.get('action')

    // ── Summary endpoint ──
    if (action === 'summary') {
      if (!customerId) {
        return NextResponse.json({ error: 'customerId is required for summary' }, { status: 400 })
      }

      if (isTurso()) {
        // Get total owed (positive amounts), total paid (negative amounts), last payment date
        const summary = await tursoExecute({
          sql: `SELECT
              COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as totalOwed,
              COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as totalPaid,
              COALESCE(SUM(amount), 0) as outstandingBalance,
              MAX(CASE WHEN amount < 0 THEN "createdAt" END) as lastPaymentDate
            FROM "CustomerCredit" WHERE "customerId" = ?`,
          args: [customerId],
        })
        const row = summary.rows[0]
        return NextResponse.json({
          totalOwed: Number(row.totalOwed),
          totalPaid: Number(row.totalPaid),
          outstandingBalance: Number(row.outstandingBalance),
          lastPaymentDate: row.lastPaymentDate || null,
        })
      } else {
        const { db } = await import('@/lib/db')
        const credits = await db.customerCredit.findMany({
          where: { customerId },
          orderBy: { createdAt: 'asc' },
        })
        const totalOwed = credits.reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0)
        const totalPaid = credits.reduce((s, c) => s + (c.amount < 0 ? Math.abs(c.amount) : 0), 0)
        const outstandingBalance = credits.reduce((s, c) => s + c.amount, 0)
        const lastPaymentCredit = [...credits].reverse().find(c => c.amount < 0)
        return NextResponse.json({
          totalOwed,
          totalPaid,
          outstandingBalance,
          lastPaymentDate: lastPaymentCredit?.createdAt?.toISOString() ?? null,
        })
      }
    }

    // ── Outstanding customers list ──
    if (outstanding && !customerId) {
      if (isTurso()) {
        const result = await tursoExecute({
          sql: `SELECT cc."customerId", c."firstName", c."lastName", c.phone,
              SUM(cc.amount) as outstandingBalance,
              MAX(cc."createdAt") as lastCreditDate
            FROM "CustomerCredit" cc
            JOIN "Customer" c ON c.id = cc."customerId"
            GROUP BY cc."customerId"
            HAVING SUM(cc.amount) > 0
            ORDER BY outstandingBalance DESC`,
          args: [],
        })
        return NextResponse.json(result.rows.map((row: any) => ({
          customerId: row.customerId,
          customerName: `${row.firstName} ${row.lastName}`,
          phone: row.phone || null,
          outstandingBalance: Number(row.outstandingBalance),
          lastCreditDate: row.lastCreditDate,
        })))
      } else {
        const { db } = await import('@/lib/db')
        const customersWithCredits = await db.customerCredit.groupBy({
          by: ['customerId'],
          _sum: { amount: true },
          having: { amount: { gt: 0 } },
          orderBy: { _sum: { amount: 'desc' } },
        })
        const results = []
        for (const c of customersWithCredits) {
          const cust = await db.customer.findUnique({ where: { id: c.customerId }, select: { firstName: true, lastName: true, phone: true } })
          const lastCredit = await db.customerCredit.findFirst({
            where: { customerId: c.customerId },
            orderBy: { createdAt: 'desc' },
          })
          results.push({
            customerId: c.customerId,
            customerName: cust ? `${cust.firstName} ${cust.lastName}` : 'Unknown',
            phone: cust?.phone || null,
            outstandingBalance: Number(c._sum.amount ?? 0),
            lastCreditDate: lastCredit?.createdAt?.toISOString() ?? null,
          })
        }
        return NextResponse.json(results)
      }
    }

    // ── Ledger for a specific customer ──
    if (customerId) {
      if (isTurso()) {
        const result = await tursoExecute({
          sql: `SELECT * FROM "CustomerCredit" WHERE "customerId" = ? ORDER BY "createdAt" ASC`,
          args: [customerId],
        })
        return NextResponse.json(result.rows.map(mapRow))
      } else {
        const { db } = await import('@/lib/db')
        const entries = await db.customerCredit.findMany({
          where: { customerId },
          orderBy: { createdAt: 'asc' },
        })
        return NextResponse.json(entries.map(e => ({
          id: e.id,
          customerId: e.customerId,
          transactionId: e.transactionId,
          amount: e.amount,
          balance: e.balance,
          description: e.description,
          createdBy: e.createdBy,
          createdAt: e.createdAt.toISOString(),
        })))
      }
    }

    // ── List all credit entries (no filter) ──
    if (isTurso()) {
      const result = await tursoExecute({
        sql: `SELECT * FROM "CustomerCredit" ORDER BY "createdAt" DESC LIMIT 200`,
        args: [],
      })
      return NextResponse.json(result.rows.map(mapRow))
    } else {
      const { db } = await import('@/lib/db')
      const entries = await db.customerCredit.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return NextResponse.json(entries.map(e => ({
        id: e.id,
        customerId: e.customerId,
        transactionId: e.transactionId,
        amount: e.amount,
        balance: e.balance,
        description: e.description,
        createdBy: e.createdBy,
        createdAt: e.createdAt.toISOString(),
      })))
    }
  } catch (error) {
    console.error('Error fetching customer credits:', error)
    return NextResponse.json({ error: 'Failed to fetch customer credits' }, { status: 500 })
  }
}

// ── POST /api/customer-credits ──
// Body: { customerId, transactionId?, amount, description }
// Positive amount = credit sale (adds to balance)
// Negative amount = payment received (reduces balance)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customerId, transactionId, amount, description } = body

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) === 0) {
      return NextResponse.json({ error: 'amount is required and must be non-zero' }, { status: 400 })
    }

    if (isTurso()) await ensureTable()

    const userId = request.headers.get('x-user-id') || null
    const numericAmount = Number(amount)

    // Calculate running balance: sum of all previous entries + new amount
    let previousBalance: number
    if (isTurso()) {
      const result = await tursoExecute({
        sql: `SELECT COALESCE(SUM(amount), 0) as total FROM "CustomerCredit" WHERE "customerId" = ?`,
        args: [customerId],
      })
      previousBalance = Number(result.rows[0]?.total ?? 0)
    } else {
      const { db } = await import('@/lib/db')
      const agg = await db.customerCredit.aggregate({
        where: { customerId },
        _sum: { amount: true },
      })
      previousBalance = Number(agg._sum.amount ?? 0)
    }

    const newBalance = previousBalance + numericAmount
    const id = generateId()
    const now = new Date().toISOString()

    // If payment would make balance negative, reject
    if (newBalance < 0) {
      return NextResponse.json({
        error: 'Payment exceeds outstanding balance',
        details: { outstandingBalance: previousBalance, paymentAttempted: Math.abs(numericAmount) },
      }, { status: 400 })
    }

    try {
      if (isTurso()) {
        await tursoExecute({
          sql: `INSERT INTO "CustomerCredit" (id, "customerId", "transactionId", amount, balance, description, "createdBy", "createdAt")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: safeArgs([id, customerId, transactionId || null, numericAmount, newBalance, description || null, userId, now]),
        })
      } else {
        const { db } = await import('@/lib/db')
        await db.customerCredit.create({
          data: {
            id,
            customerId,
            transactionId: transactionId || null,
            amount: numericAmount,
            balance: newBalance,
            description: description || null,
            createdBy: userId,
          },
        })
      }
    } catch (err) {
      console.error('Error inserting customer credit:', err)
      return NextResponse.json({ error: 'Failed to create credit entry' }, { status: 500 })
    }

    const { ipAddress, userAgent } = getRequestContext(request)
    const actionType = numericAmount > 0 ? 'CREDIT_SALE_RECORDED' : 'CREDIT_PAYMENT_RECORDED'
    await writeAuditLog({
      userId: userId || undefined,
      action: actionType,
      category: 'credits',
      entity: 'CustomerCredit',
      entityId: id,
      details: { customerId, amount: numericAmount, balance: newBalance, description },
      ipAddress,
      userAgent,
    }).catch(() => {})

    return NextResponse.json({
      id,
      customerId,
      transactionId: transactionId || null,
      amount: numericAmount,
      balance: newBalance,
      description: description || null,
      createdBy: userId,
      createdAt: now,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating customer credit:', error)
    return NextResponse.json({ error: 'Failed to create credit entry' }, { status: 500 })
  }
}

// ── DELETE /api/customer-credits?id=... (admin only) ──

export async function DELETE(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only SUPER_ADMIN can delete credit entries' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const entryId = searchParams.get('id')
    if (!entryId) {
      return NextResponse.json({ error: 'Credit entry id is required' }, { status: 400 })
    }

    if (isTurso()) await ensureTable()

    try {
      if (isTurso()) {
        await tursoExecute({
          sql: `DELETE FROM "CustomerCredit" WHERE id = ?`,
          args: [entryId],
        })
      } else {
        const { db } = await import('@/lib/db')
        await db.customerCredit.delete({ where: { id: entryId } })
      }
    } catch (err) {
      console.error('Error deleting customer credit:', err)
      return NextResponse.json({ error: 'Failed to delete credit entry' }, { status: 500 })
    }

    const { userId, ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({
      userId,
      action: 'CREDIT_ENTRY_DELETED',
      category: 'credits',
      entity: 'CustomerCredit',
      entityId: entryId,
      details: {},
      ipAddress,
      userAgent,
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting customer credit:', error)
    return NextResponse.json({ error: 'Failed to delete credit entry' }, { status: 500 })
  }
}
