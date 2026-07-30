import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, generateReturnNo } from '@/lib/turso'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toObjs(result: { columns: Array<{ name: string }>; rows: Array<Array<unknown>> }) {
  const names = result.columns.map((c) => c.name)
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((n, i) => {
      obj[n] = row[i]
    })
    return obj
  })
}

const bool = (v: unknown): boolean => v === 1 || v === true

// ---------------------------------------------------------------------------
// GET /api/returns — list returns with optional filters
// RBAC: SUPER_ADMIN sees all returns; other roles see only their own
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const reason = searchParams.get('reason')
    const search = searchParams.get('search')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const requesterRole = req.headers.get('x-user-role') || ''
    const requesterId = req.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    // ---- Turso raw SQL path ----
    if (isTurso()) {
      const conditions: string[] = []
      const args: unknown[] = []

      // RBAC: non-admin sees only their own returns
      if (!isSuperAdmin && requesterId) {
        conditions.push('r."userId" = ?')
        args.push(requesterId)
      }
      if (status && status !== 'ALL') {
        conditions.push('r."status" = ?')
        args.push(status)
      }
      if (reason && reason !== 'ALL') {
        conditions.push('r."reason" = ?')
        args.push(reason)
      }
      if (search) {
        conditions.push(
          '(r."returnNo" LIKE \'%\' || ? || \'%\' OR r."productName" LIKE \'%\' || ? || \'%\' OR r."customerName" LIKE \'%\' || ? || \'%\')'
        )
        args.push(search, search, search)
      }
      if (from) {
        conditions.push('r."createdAt" >= ?')
        args.push(from)
      }
      if (to) {
        conditions.push('r."createdAt" <= ?')
        args.push(to)
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
      const offset = (page - 1) * limit

      // Fetch paginated returns with JOINs
      const returnsResult = await turso.execute({
        sql: `SELECT r."id", r."returnNo", r."transactionId", r."transactionItemId",
                    r."productId", r."productName", r."quantity", r."unitPrice",
                    r."refundAmount", r."reason", r."reasonNote", r."customerId",
                    r."customerName", r."userId", r."status", r."approvedById",
                    r."approvedAt", r."refundMethod", r."refundProcessed", r."restocked",
                    r."notes", r."createdAt", r."updatedAt",
                    u."id" AS "userId_val", u."name" AS "userName", u."role" AS "userRole",
                    a."id" AS "approvedById_val", a."name" AS "approvedByName",
                    t."transactionNo",
                    p."id" AS "prodId", p."name" AS "prodName", p."ndc" AS "prodNdc"
             FROM "Return" r
             LEFT JOIN "User" u ON u."id" = r."userId"
             LEFT JOIN "User" a ON a."id" = r."approvedById"
             LEFT JOIN "Transaction" t ON t."id" = r."transactionId"
             LEFT JOIN "Product" p ON p."id" = r."productId"
             ${whereClause}
             ORDER BY r."createdAt" DESC
             LIMIT ? OFFSET ?`,
        args: [...args, limit, offset],
      })

      const returns = toObjs(returnsResult).map((row) => ({
        id: row.id,
        returnNo: row.returnNo,
        transactionId: row.transactionId,
        transactionItemId: row.transactionItemId,
        productId: row.productId,
        productName: row.productName,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
        refundAmount: Number(row.refundAmount),
        reason: row.reason,
        reasonNote: row.reasonNote,
        customerId: row.customerId,
        customerName: row.customerName,
        userId: row.userId,
        status: row.status,
        approvedById: row.approvedById,
        approvedAt: row.approvedAt,
        refundMethod: row.refundMethod,
        refundProcessed: bool(row.refundProcessed),
        restocked: bool(row.restocked),
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        user: row.userId_val ? { id: row.userId_val, name: row.userName, role: row.userRole } : null,
        approvedBy: row.approvedById_val
          ? { id: row.approvedById_val, name: row.approvedByName }
          : null,
        transaction: row.transactionNo ? { transactionNo: row.transactionNo } : null,
        product: row.prodId ? { id: row.prodId, name: row.prodName, ndc: row.prodNdc } : null,
      }))

      // Total count for pagination
      const countResult = await turso.execute({
        sql: `SELECT COUNT(*) AS cnt FROM "Return" r ${whereClause}`,
        args,
      })
      const total = Number(toObjs(countResult)[0]?.cnt ?? 0)

      // Summary stats (own-filter only, no status/reason/search/date filters)
      const sConditions: string[] = []
      const sArgs: unknown[] = []
      if (!isSuperAdmin && requesterId) {
        sConditions.push('"userId" = ?')
        sArgs.push(requesterId)
      }
      const sWhere = sConditions.length > 0 ? 'WHERE ' + sConditions.join(' AND ') : ''

      const [totalRes, pendingRes, completedRes, refundRes, topReasonsRes] = await Promise.all([
        turso.execute({ sql: `SELECT COUNT(*) AS cnt FROM "Return" ${sWhere}`, args: sArgs }),
        turso.execute({
          sql: `SELECT COUNT(*) AS cnt FROM "Return" ${sWhere ? sWhere + ' AND' : 'WHERE'} "status" = ?`,
          args: [...sArgs, 'PENDING_APPROVAL'],
        }),
        turso.execute({
          sql: `SELECT COUNT(*) AS cnt FROM "Return" ${sWhere ? sWhere + ' AND' : 'WHERE'} "status" = ?`,
          args: [...sArgs, 'COMPLETED'],
        }),
        turso.execute({
          sql: `SELECT COALESCE(SUM("refundAmount"), 0) AS total FROM "Return" ${sWhere ? sWhere + ' AND' : 'WHERE'} "status" IN (?, ?)`,
          args: [...sArgs, 'APPROVED', 'COMPLETED'],
        }),
        turso.execute({
          sql: `SELECT "reason", COUNT(*) AS _count FROM "Return" ${sWhere} GROUP BY "reason" ORDER BY _count DESC LIMIT 5`,
          args: sArgs,
        }),
      ])

      return NextResponse.json({
        returns,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        summary: {
          totalReturns: Number(toObjs(totalRes)[0]?.cnt ?? 0),
          pendingCount: Number(toObjs(pendingRes)[0]?.cnt ?? 0),
          completedCount: Number(toObjs(completedRes)[0]?.cnt ?? 0),
          totalRefundAmount: Number(toObjs(refundRes)[0]?.total ?? 0),
          topReasons: toObjs(topReasonsRes).map((r) => ({
            reason: r.reason,
            _count: { reason: Number(r._count) },
          })),
        },
      })
    }

    // ---- Prisma fallback ----
    const { db } = await import('@/lib/db')
    const where: Record<string, unknown> = {}
    if (!isSuperAdmin && requesterId) { where.userId = requesterId }
    if (status && status !== 'ALL') { where.status = status }
    if (reason && reason !== 'ALL') { where.reason = reason }
    if (search) {
      where.OR = [
        { returnNo: { contains: search } },
        { productName: { contains: search } },
        { customerName: { contains: search } },
      ]
    }
    if (from || to) {
      where.createdAt = {} as Record<string, unknown>
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from)
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to)
    }

    const [returns, total] = await Promise.all([
      db.return.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, role: true } },
          approvedBy: { select: { id: true, name: true } },
          transaction: { select: { transactionNo: true } },
          product: { select: { id: true, name: true, ndc: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.return.count({ where }),
    ])

    const userFilter = isSuperAdmin ? {} : (requesterId ? { userId: requesterId } : { userId: '__none__' })
    const [totalReturns, pendingCount, completedCount, totalRefundAmount] = await Promise.all([
      db.return.count({ where: userFilter }),
      db.return.count({ where: { ...userFilter, status: 'PENDING_APPROVAL' } }),
      db.return.count({ where: { ...userFilter, status: 'COMPLETED' } }),
      db.return.aggregate({
        where: { ...userFilter, status: { in: ['APPROVED', 'COMPLETED'] } },
        _sum: { refundAmount: true },
      }),
    ])
    const topReasons = await db.return.groupBy({
      by: ['reason'],
      where: userFilter,
      _count: { reason: true },
      orderBy: { _count: { reason: 'desc' } },
      take: 5,
    })

    return NextResponse.json({
      returns,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary: {
        totalReturns,
        pendingCount,
        completedCount,
        totalRefundAmount: totalRefundAmount._sum.refundAmount || 0,
        topReasons,
      },
    })
  } catch (error) {
    console.error('GET /api/returns error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch returns', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/returns — create a return
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      transactionId,
      transactionItemId,
      productId,
      productName,
      quantity,
      unitPrice,
      refundAmount,
      reason,
      reasonNote,
      customerId,
      customerName,
      userId,
      refundMethod,
    } = body

    if (!transactionId || !transactionItemId || !productId || !productName || !quantity || !unitPrice || !reason || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const qty = Number(quantity)
    const price = Number(unitPrice)
    const refund = Number(refundAmount)
    if (qty <= 0) {
      return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
    }

    // ---- Turso raw SQL path ----
    if (isTurso()) {
      // Validate referenced transaction exists
      const txResult = await turso.execute({
        sql: 'SELECT 1 AS ok FROM "Transaction" WHERE "id" = ?',
        args: [transactionId],
      })
      if (txResult.rows.length === 0) {
        return NextResponse.json({ error: 'Referenced transaction not found' }, { status: 400 })
      }

      // Validate referenced transaction item exists
      const txItemResult = await turso.execute({
        sql: 'SELECT 1 AS ok FROM "TransactionItem" WHERE "id" = ?',
        args: [transactionItemId],
      })
      if (txItemResult.rows.length === 0) {
        return NextResponse.json({ error: 'Referenced transaction item not found' }, { status: 400 })
      }

      const id = generateId()
      const returnNo = generateReturnNo()
      const now = new Date().toISOString()
      const calcRefund = refund || price * qty

      await turso.execute({
        sql: `INSERT INTO "Return" ("id", "returnNo", "transactionId", "transactionItemId",
               "productId", "productName", "quantity", "unitPrice", "refundAmount",
               "reason", "reasonNote", "customerId", "customerName", "userId",
               "status", "approvedById", "approvedAt", "refundMethod",
               "refundProcessed", "restocked", "notes", "createdAt", "updatedAt")
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          id, returnNo, transactionId, transactionItemId, productId, productName,
          qty, price, calcRefund, reason, reasonNote || null, customerId || null,
          customerName || null, userId, 'PENDING_APPROVAL', null, null,
          refundMethod || 'CASH', 0, 0, null, now, now,
        ],
      })

      // Fetch the created return with JOINs for the response
      const createdResult = await turso.execute({
        sql: `SELECT r."id", r."returnNo", r."transactionId", r."transactionItemId",
                    r."productId", r."productName", r."quantity", r."unitPrice",
                    r."refundAmount", r."reason", r."reasonNote", r."customerId",
                    r."customerName", r."userId", r."status", r."approvedById",
                    r."approvedAt", r."refundMethod", r."refundProcessed", r."restocked",
                    r."notes", r."createdAt", r."updatedAt",
                    u."id" AS "userId_val", u."name" AS "userName", u."role" AS "userRole",
                    t."transactionNo",
                    p."id" AS "prodId", p."name" AS "prodName"
             FROM "Return" r
             LEFT JOIN "User" u ON u."id" = r."userId"
             LEFT JOIN "Transaction" t ON t."id" = r."transactionId"
             LEFT JOIN "Product" p ON p."id" = r."productId"
             WHERE r."id" = ?`,
        args: [id],
      })

      const row = toObjs(createdResult)[0]
      const returnRecord = {
        id: row.id,
        returnNo: row.returnNo,
        transactionId: row.transactionId,
        transactionItemId: row.transactionItemId,
        productId: row.productId,
        productName: row.productName,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
        refundAmount: Number(row.refundAmount),
        reason: row.reason,
        reasonNote: row.reasonNote,
        customerId: row.customerId,
        customerName: row.customerName,
        userId: row.userId,
        status: row.status,
        approvedById: row.approvedById,
        approvedAt: row.approvedAt,
        refundMethod: row.refundMethod,
        refundProcessed: bool(row.refundProcessed),
        restocked: bool(row.restocked),
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        user: row.userId_val ? { id: row.userId_val, name: row.userName, role: row.userRole } : null,
        transaction: row.transactionNo ? { transactionNo: row.transactionNo } : null,
        product: row.prodId ? { id: row.prodId, name: row.prodName } : null,
      }

      return NextResponse.json({ return: returnRecord }, { status: 201 })
    }

    // ---- Prisma fallback ----
    const { db } = await import('@/lib/db')
    const txExists = await db.transaction.findUnique({ where: { id: transactionId } })
    if (!txExists) {
      return NextResponse.json({ error: 'Referenced transaction not found' }, { status: 400 })
    }
    const txItemExists = await db.transactionItem.findUnique({ where: { id: transactionItemId } })
    if (!txItemExists) {
      return NextResponse.json({ error: 'Referenced transaction item not found' }, { status: 400 })
    }

    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayReturns = await db.return.count({ where: { createdAt: { gte: todayStart } } })
    const seq = String(todayReturns + 1).padStart(4, '0')
    const returnNo = 'RTN-' + dateStr + '-' + seq

    const returnRecord = await db.return.create({
      data: {
        returnNo,
        transactionId,
        transactionItemId,
        productId,
        productName,
        quantity: qty,
        unitPrice: price,
        refundAmount: refund || price * qty,
        reason,
        reasonNote,
        customerId: customerId || null,
        customerName: customerName || null,
        userId,
        refundMethod: refundMethod || 'CASH',
        status: 'PENDING_APPROVAL',
        restocked: false,
        refundProcessed: false,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        transaction: { select: { transactionNo: true } },
        product: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ return: returnRecord }, { status: 201 })
  } catch (error) {
    console.error('POST /api/returns error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to create return', detail: msg }, { status: 500 })
  }
}
