import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'

function toObjs(result: { columns: Array<string>; rows: Array<Array<unknown>> }) {
  const names = result.columns.map((c) => c)
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((n, i) => { obj[n] = row[i] })
    return obj
  })
}

// ---------------------------------------------------------------------------
// GET /api/shifts  –  active shift check or shift report
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const userId = searchParams.get('userId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    // ---- Check for active shift ----
    if (action === 'active') {
      const uid = userId || request.headers.get('x-user-id') || ''
      if (!uid) return NextResponse.json({ active: false })

      if (isTurso()) {
        const result = await turso.execute({
          sql: `SELECT id, "userId", "userName", "startedAt", "cashAtStart"
                FROM "Shift" WHERE "userId" = ? AND status = 'ACTIVE'
                ORDER BY "startedAt" DESC LIMIT 1`,
          args: [uid],
        })
        if (result.rows.length === 0) return NextResponse.json({ active: false })
        const row = result.rows[0]
        return NextResponse.json({
          active: true,
          shift: { id: row[0], userId: row[1], userName: row[2], startedAt: row[3], cashAtStart: row[4] },
        })
      }
      return NextResponse.json({ active: false })
    }

    // ---- Shift report ----
    const requesterRole = request.headers.get('x-user-role') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    if (isTurso()) {
      const txnConditions: string[] = [`t.status = 'COMPLETED'`]
      const txnArgs: unknown[] = []

      if (from) { txnConditions.push('t."createdAt" >= ?'); txnArgs.push(new Date(from).toISOString()) }
      if (to) { txnConditions.push('t."createdAt" <= ?'); txnArgs.push(new Date(to).toISOString()) }
      if (userId) {
        txnConditions.push('t."userId" = ?'); txnArgs.push(userId)
      } else if (!isSuperAdmin) {
        const reqId = request.headers.get('x-user-id') || ''
        if (reqId) { txnConditions.push('t."userId" = ?'); txnArgs.push(reqId) }
      }

      const whereClause = 'WHERE ' + txnConditions.join(' AND ')

      // 1. Summary
      const summaryResult = await turso.execute({
        sql: `SELECT COALESCE(SUM(t.total), 0) as totalSales,
                     COUNT(t.id) as totalTransactions,
                     COALESCE(SUM(t.subtotal), 0) as totalSubtotal,
                     COALESCE(SUM(t.discount), 0) as totalDiscount
              FROM "Transaction" t ${whereClause}`,
        args: txnArgs,
      })
      const summary = toObjs(summaryResult)[0]

      // 2. Items sold per product
      const itemsResult = await turso.execute({
        sql: `SELECT ti."productId" as productId, ti."productName" as productName,
                       SUM(ti.quantity) as totalQty,
                       SUM(ti.subtotal) as totalRevenue
                FROM TransactionItem ti
                JOIN "Transaction" t ON ti."transactionId" = t.id
                ${whereClause}
                GROUP BY ti."productId", ti."productName"
                ORDER BY totalQty DESC`,
        args: txnArgs,
      })
      const itemsSold = toObjs(itemsResult).map((r) => ({
        productId: r.productId, productName: r.productName,
        quantitySold: (r.totalQty as number) || 0, revenue: (r.totalRevenue as number) || 0,
      }))

      // 3. Current inventory snapshot
      const invResult = await turso.execute({
        sql: `SELECT p.id as productId, p.name as productName, i.quantity as currentStock,
                       p."sellingPrice" as sellingPrice, p.category
                FROM Inventory i JOIN "Product" p ON i."productId" = p.id
                WHERE i.quantity > 0 ORDER BY i.quantity ASC`,
        args: [],
      })
      const inventorySnapshot = toObjs(invResult).map((r) => ({
        productId: r.productId, productName: r.productName,
        currentStock: (r.currentStock as number) || 0,
        sellingPrice: (r.sellingPrice as number) || 0, category: r.category,
      }))

      // 4. Sales by user (admin)
      let salesByUser: Array<{ userId: string; userName: string; sales: number; txnCount: number }> = []
      if (isSuperAdmin) {
        const userSalesResult = await turso.execute({
          sql: `SELECT t."userId" as userId, u.name as userName,
                         SUM(t.total) as sales, COUNT(t.id) as txnCount
                  FROM "Transaction" t LEFT JOIN User u ON t."userId" = u.id
                  ${whereClause}
                  GROUP BY t."userId", u.name ORDER BY sales DESC`,
          args: txnArgs,
        })
        salesByUser = toObjs(userSalesResult).map((r) => ({
          userId: r.userId as string, userName: (r.userName as string) || 'Unknown',
          sales: (r.sales as number) || 0, txnCount: (r.txnCount as number) || 0,
        }))
      }

      // 5. Shift history
      const shiftWhere: string[] = []
      const shiftArgs: unknown[] = []
      if (userId) { shiftWhere.push('"userId" = ?'); shiftArgs.push(userId) }
      if (from) { shiftWhere.push('"startedAt" >= ?'); shiftArgs.push(new Date(from).toISOString()) }
      if (to) { shiftWhere.push('"startedAt" <= ?'); shiftArgs.push(new Date(to).toISOString()) }
      const shiftClause = shiftWhere.length > 0 ? 'WHERE ' + shiftWhere.join(' AND ') : ''

      const shiftListResult = await turso.execute({
        sql: `SELECT id, "userId", "userName", "startedAt", "endedAt", status,
                       "totalSales", "totalTransactions", "totalItemsSold"
                FROM "Shift" ${shiftClause} ORDER BY "startedAt" DESC LIMIT 50`,
        args: shiftArgs,
      })
      const shiftHistory = toObjs(shiftListResult).map((r) => ({
        id: r.id, userId: r.userId, userName: r.userName,
        startedAt: r.startedAt, endedAt: r.endedAt, status: r.status,
        totalSales: (r.totalSales as number) || 0,
        totalTransactions: (r.totalTransactions as number) || 0,
        totalItemsSold: (r.totalItemsSold as number) || 0,
      }))

      // 6. Users list for filter (admin)
      let users: Array<{ id: string; name: string }> = []
      if (isSuperAdmin) {
        const usersResult = await turso.execute({
          sql: `SELECT id, name FROM User WHERE active = 1 ORDER BY name`,
          args: [],
        })
        users = toObjs(usersResult).map((r) => ({ id: r.id as string, name: r.name as string }))
      }

      return NextResponse.json({
        summary: {
          totalSales: (summary?.totalSales as number) || 0,
          totalTransactions: (summary?.totalTransactions as number) || 0,
          totalSubtotal: (summary?.totalSubtotal as number) || 0,
          totalDiscount: (summary?.totalDiscount as number) || 0,
          totalItemsSold: itemsSold.reduce((s, i) => s + i.quantitySold, 0),
          totalProductsSold: itemsSold.length,
          inventoryItemCount: inventorySnapshot.length,
        },
        itemsSold, inventorySnapshot, salesByUser, shiftHistory, users,
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const where: Record<string, unknown> = { status: 'COMPLETED' }
    if (from || to) {
      where.createdAt = {} as Record<string, unknown>
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from)
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to)
    }
    if (userId) where.userId = userId
    else if (!isSuperAdmin) {
      const reqId = request.headers.get('x-user-id') || ''
      if (reqId) where.userId = reqId
    }

    const [transactions, inventoryItems] = await Promise.all([
      db.transaction.findMany({ where, include: { items: true } }),
      db.inventory.findMany({ where: { quantity: { gt: 0 } }, include: { product: { select: { name: true, sellingPrice: true, category: true } } } }),
    ])
    const totalSales = transactions.reduce((s, t) => s + t.total, 0)
    const totalDiscount = transactions.reduce((s, t) => s + t.discount, 0)
    const itemsMap: Record<string, { productName: string; qty: number; revenue: number }> = {}
    for (const t of transactions) {
      for (const item of t.items) {
        if (!itemsMap[item.productId]) itemsMap[item.productId] = { productName: item.productName, qty: 0, revenue: 0 }
        itemsMap[item.productId].qty += item.quantity
        itemsMap[item.productId].revenue += item.subtotal
      }
    }
    const itemsSold = Object.entries(itemsMap).map(([productId, data]) => ({
      productId, productName: data.productName, quantitySold: data.qty, revenue: data.revenue,
    })).sort((a, b) => b.quantitySold - a.quantitySold)

    return NextResponse.json({
      summary: {
        totalSales, totalTransactions: transactions.length, totalSubtotal: totalSales + totalDiscount,
        totalDiscount, totalItemsSold: itemsSold.reduce((s, i) => s + i.quantitySold, 0),
        totalProductsSold: itemsSold.length, inventoryItemCount: inventoryItems.length,
      },
      itemsSold,
      inventorySnapshot: inventoryItems.map((i) => ({
        productId: i.productId, productName: i.product.name, currentStock: i.quantity,
        sellingPrice: i.product.sellingPrice, category: i.product.category,
      })),
      salesByUser: [], shiftHistory: [], users: [],
    })
  } catch (error) {
    console.error('Error fetching shift report:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch shift report', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/shifts  –  start or end a shift
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, shiftId, cashAtStart } = body
    const userId = request.headers.get('x-user-id') || ''
    const userName = request.headers.get('x-user-name') || ''
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    if (!isTurso()) return NextResponse.json({ error: 'Shift tracking requires cloud database' }, { status: 400 })

    const now = new Date().toISOString()

    if (action === 'start') {
      const existing = await turso.execute({
        sql: `SELECT id FROM "Shift" WHERE "userId" = ? AND status = 'ACTIVE'`,
        args: [userId],
      })
      if (existing.rows.length > 0) {
        return NextResponse.json({ error: 'You already have an active shift' }, { status: 400 })
      }
      const id = generateId()
      await turso.execute({
        sql: `INSERT INTO "Shift" (id, "userId", "userName", "startedAt", status, "cashAtStart", "createdAt", "updatedAt")
              VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
        args: [id, userId, userName, now, cashAtStart || null, now, now],
      })
      return NextResponse.json({ id, userId, userName, startedAt: now, cashAtStart, status: 'ACTIVE' }, { status: 201 })
    }

    if (action === 'end') {
      const sid = shiftId || ''
      if (!sid) return NextResponse.json({ error: 'shiftId is required' }, { status: 400 })

      const shiftResult = await turso.execute({
        sql: `SELECT id, "userId", "startedAt", "cashAtStart" FROM "Shift" WHERE id = ? AND status = 'ACTIVE'`,
        args: [sid],
      })
      if (shiftResult.rows.length === 0) {
        return NextResponse.json({ error: 'Active shift not found' }, { status: 404 })
      }
      const shift = shiftResult.rows[0]
      const startedAt = shift[2] as string

      const statsResult = await turso.execute({
        sql: `SELECT COALESCE(SUM(t.total), 0) as totalSales, COUNT(t.id) as totalTransactions
              FROM "Transaction" t
              WHERE t."userId" = ? AND t.status = 'COMPLETED' AND t."createdAt" >= ? AND t."createdAt" <= ?`,
        args: [userId, startedAt, now],
      })
      const stats = toObjs(statsResult)[0]
      const totalSales = (stats?.totalSales as number) || 0
      const totalTransactions = (stats?.totalTransactions as number) || 0

      const itemsStatsResult = await turso.execute({
        sql: `SELECT COALESCE(SUM(ti.quantity), 0) as totalItems
              FROM TransactionItem ti JOIN "Transaction" t ON ti."transactionId" = t.id
              WHERE t."userId" = ? AND t.status = 'COMPLETED' AND t."createdAt" >= ? AND t."createdAt" <= ?`,
        args: [userId, startedAt, now],
      })
      const totalItemsSold = (toObjs(itemsStatsResult)[0]?.totalItems as number) || 0

      await turso.execute({
        sql: `UPDATE "Shift" SET status = 'ENDED', "endedAt" = ?,
                "totalSales" = ?, "totalTransactions" = ?, "totalItemsSold" = ?, "updatedAt" = ?
                WHERE id = ?`,
        args: [now, totalSales, totalTransactions, totalItemsSold, now, sid],
      })

      // ── Capture inventory snapshot at shift end ──
      const invSnapshotResult = await turso.execute({
        sql: `SELECT i."productId", p.name as "productName", i.quantity,
                     p."sellingPrice", p."costPrice"
              FROM Inventory i JOIN "Product" p ON i."productId" = p.id
              WHERE i.quantity > 0`,
        args: [],
      })
      const invRows = toObjs(invSnapshotResult)
      if (invRows.length > 0) {
        const snapStmts = invRows.map((r) => ({
          sql: `INSERT INTO "ShiftInventory" (id, "shiftId", "productId", "productName", quantity, "sellingPrice", "costPrice", "createdAt")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            generateId(), sid,
            r.productId, r.productName,
            (r.quantity as number) || 0,
            r.sellingPrice, r.costPrice,
            now,
          ],
        }))
        await turso.batch(snapStmts)
      }

      return NextResponse.json({
        id: sid, userId, userName, startedAt, endedAt: now,
        status: 'ENDED', totalSales, totalTransactions, totalItemsSold,
        cashAtStart: shift[3],
      })
    }

    return NextResponse.json({ error: 'Invalid action. Use action=start or action=end' }, { status: 400 })
  } catch (error) {
    console.error('Error managing shift:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to manage shift', detail: msg }, { status: 500 })
  }
}
