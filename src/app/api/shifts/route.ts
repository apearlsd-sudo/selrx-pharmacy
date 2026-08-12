import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

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
        try { await ensureShiftTables() } catch { /* non-fatal */ }
        const result = await turso.execute({
          sql: `SELECT id, "userId", "userName", "startedAt", "cashAtStart"
                FROM "Shift" WHERE "userId" = ? AND status = 'ACTIVE'
                ORDER BY "startedAt" DESC LIMIT 1`,
          args: [uid],
        })
        if (result.rows.length === 0) return NextResponse.json({ active: false })
        const row = result.rows[0]
        const startedAt = row[3] as string
        // Auto-end shifts older than 24 hours (stuck shifts from previous days)
        const shiftAge = Date.now() - new Date(startedAt).getTime()
        if (shiftAge > 24 * 60 * 60 * 1000) {
          const now = new Date().toISOString()
          const closedId = row[0] as string
          await turso.execute({
            sql: `UPDATE "Shift" SET status = 'ENDED', "endedAt" = ?, "updatedAt" = ? WHERE id = ?`,
            args: [now, now, closedId],
          })
          // Capture inventory snapshot for the auto-closed shift so the
          // day-opening chain is never broken (no gap without snapshot data).
          try { await captureInventorySnapshot(closedId, now) } catch (e) {
            console.error(`[ShiftAutoClose] Failed to capture snapshot for ${closedId}:`, e)
          }
          return NextResponse.json({ active: false, autoClosed: true, closedShiftId: closedId })
        }
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
      const shiftClause = shiftWhere.length > 0 ? 'WHERE ' + shiftWhere.join(' AND ') + " AND status != 'DAY_OPENING'" : "WHERE status != 'DAY_OPENING'"

      const shiftListResult = await turso.execute({
        sql: `SELECT id, "userId", "userName", "startedAt", "endedAt", status,
                       "totalSales", "totalTransactions", "totalItemsSold",
                       "cashAtStart", "cashAtEnd", "expectedCash", "cashDiscrepancy"
                FROM "Shift" ${shiftClause} ORDER BY "startedAt" DESC LIMIT 50`,
        args: shiftArgs,
      })
      const shiftHistory = toObjs(shiftListResult).map((r) => ({
        id: r.id, userId: r.userId, userName: r.userName,
        startedAt: r.startedAt, endedAt: r.endedAt, status: r.status,
        totalSales: (r.totalSales as number) || 0,
        totalTransactions: (r.totalTransactions as number) || 0,
        totalItemsSold: (r.totalItemsSold as number) || 0,
        cashAtStart: (r.cashAtStart as number) || null,
        cashAtEnd: (r.cashAtEnd as number) || null,
        expectedCash: (r.expectedCash as number) || null,
        cashDiscrepancy: (r.cashDiscrepancy as number) || null,
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

interface DayOpeningResult {
  created: boolean
  inventorySynced: boolean
  sourceShiftId: string | null
  sourceDate: string | null
  productsUpdated: number
}

/**
 * Captures a point-in-time inventory snapshot into ShiftInventory for a given shift.
 * Used at normal shift end AND when auto-ending stuck shifts so that the
 * snapshot chain is never broken for day-opening reconciliation.
 */
async function captureInventorySnapshot(shiftId: string, nowIso: string): Promise<number> {
  const invResult = await turso.execute({
    sql: `SELECT i."productId", p.name as "productName", i.quantity,
                 p."sellingPrice", p."costPrice", p.category
          FROM Inventory i JOIN "Product" p ON i."productId" = p.id
          WHERE i.quantity > 0`,
    args: [],
  })
  const rows = toObjs(invResult)
  if (rows.length > 0) {
    const stmts = rows.map((r) => ({
      sql: `INSERT INTO "ShiftInventory" (id, "shiftId", "productId", "productName", quantity, "sellingPrice", "costPrice", category, "createdAt")
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        generateId(), shiftId,
        r.productId, r.productName,
        (r.quantity as number) || 0,
        r.sellingPrice, r.costPrice, r.category || null,
        nowIso,
      ],
    }))
    await turso.batch(stmts)
  }
  console.log(`[ShiftSnapshot] Captured ${rows.length} products for shift ${shiftId}`)
  return rows.length
}

async function ensureDayOpeningSnapshot(nowIso: string): Promise<DayOpeningResult> {
  const today = nowIso.split('T')[0] // YYYY-MM-DD
  const dayStart = today + 'T00:00:00.000Z'
  const dayEnd = today + 'T23:59:59.999Z'
  const defaultResult: DayOpeningResult = { created: false, inventorySynced: false, sourceShiftId: null, sourceDate: null, productsUpdated: 0 }

  // Check if a DAY_OPENING snapshot already exists for today
  const existing = await turso.execute({
    sql: `SELECT id FROM "Shift" WHERE status = 'DAY_OPENING' AND "startedAt" >= ? AND "startedAt" <= ?`,
    args: [dayStart, dayEnd],
  })
  if (existing.rows.length > 0) return { ...defaultResult, created: true } // Already exists for today

  // Find the previous day's last ended shift that has actual inventory snapshot data.
  // Go back up to 7 days to handle weekends/holidays. Skip shifts with empty
  // snapshots (e.g. auto-ended shifts that predated snapshot capture) so we
  // always find a reliable source.
  let sourceShiftId: string | null = null
  let sourceEndedAt: string | null = null
  let sourceUserName: string | null = null
  let sourceDate: string | null = null

  for (let daysBack = 1; daysBack <= 7; daysBack++) {
    const prevDate = new Date(nowIso)
    prevDate.setDate(prevDate.getDate() - daysBack)
    const prevDateStr = prevDate.toISOString().split('T')[0]
    const prevStart = prevDateStr + 'T00:00:00.000Z'
    const prevEnd = prevDateStr + 'T23:59:59.999Z'

    // Find all ENDED shifts for this day, ordered by most recent first
    const prevShiftResult = await turso.execute({
      sql: `SELECT id, "userName", "endedAt" FROM "Shift"
            WHERE status = 'ENDED' AND "startedAt" >= ? AND "startedAt" <= ?
            ORDER BY "endedAt" DESC`,
      args: [prevStart, prevEnd],
    })
    const prevShifts = toObjs(prevShiftResult)

    // Pick the first shift that actually has ShiftInventory records
    for (const ps of prevShifts) {
      const snapCheck = await turso.execute({
        sql: `SELECT COUNT(*) as cnt FROM "ShiftInventory" WHERE "shiftId" = ?`,
        args: [ps.id],
      })
      const snapCount = (snapCheck.rows[0][0] as number) || 0
      if (snapCount > 0) {
        sourceShiftId = ps.id as string
        sourceUserName = ps.userName as string
        sourceEndedAt = ps.endedAt as string
        sourceDate = prevDateStr
        break
      }
    }
    if (sourceShiftId) break
  }

  // Create the DAY_OPENING shift record
  const openingId = generateId()
  const openingNow = new Date().toISOString()
  await turso.execute({
    sql: `INSERT INTO "Shift" (id, "userId", "userName", "startedAt", "endedAt", status, "createdAt", "updatedAt")
          VALUES (?, '__system__', 'Day Opening', ?, ?, 'DAY_OPENING', ?, ?)`,
    args: [openingId, dayStart, sourceEndedAt || openingNow, openingNow, openingNow],
  })

  // Copy inventory from source shift, or snapshot current live inventory
  if (sourceShiftId) {
    // Copy from previous day's last shift snapshot
    const srcInvResult = await turso.execute({
      sql: `SELECT "productId", "productName", quantity, "sellingPrice", "costPrice", category
            FROM "ShiftInventory" WHERE "shiftId" = ?`,
      args: [sourceShiftId],
    })
    const srcRows = toObjs(srcInvResult)
    // (sourceShiftId is guaranteed to have ShiftInventory records due to
    //  the count-check during source selection above, but guard anyway)
    if (srcRows.length === 0) {
      console.warn(`[DayOpening] Source shift ${sourceShiftId} unexpectedly has no ShiftInventory; falling back to live inventory`)
      // Fall through to live inventory snapshot below
    } else {
      // 1. Copy snapshot into ShiftInventory for reporting
      const snapStmts = srcRows.map((r) => ({
        sql: `INSERT INTO "ShiftInventory" (id, "shiftId", "productId", "productName", quantity, "sellingPrice", "costPrice", category, "createdAt")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          generateId(), openingId,
          r.productId, r.productName,
          (r.quantity as number) || 0,
          r.sellingPrice, r.costPrice, r.category || null,
          openingNow,
        ],
      }))
      await turso.batch(snapStmts)

      // 2. Sync live Inventory table to match the previous day's ended shift snapshot.
      //    This ensures the POS starts each new day with the exact stock levels
      //    recorded at the end of the previous day's last shift, correcting any
      //    discrepancies that may have occurred (manual edits, system errors, etc.).
      //    Products NOT in the snapshot are left untouched (they had 0 stock at
      //    shift end but may have been restocked between shifts).
      const syncStmts = srcRows.map((r) => {
        const qty = (r.quantity as number) || 0
        return {
          sql: `INSERT INTO Inventory (id, "productId", quantity, "lastCounted", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT("productId") DO UPDATE SET quantity = excluded.quantity, "lastCounted" = excluded."lastCounted", "updatedAt" = excluded."updatedAt"`,
          args: [generateId(), r.productId, qty, openingNow, openingNow, openingNow],
        }
      })
      await turso.batch(syncStmts)

      console.log(`[DayOpening] Synced ${srcRows.length} products from ${sourceDate} shift ${sourceShiftId} to live Inventory`)
      return { created: true, inventorySynced: true, sourceShiftId, sourceDate, productsUpdated: srcRows.length }
    }
  }

  // No valid source shift found (or source had empty snapshot) — snapshot current live inventory as fallback
  const liveInvResult = await turso.execute({
    sql: `SELECT i."productId", p.name as "productName", i.quantity,
                 p."sellingPrice", p."costPrice", p.category
          FROM Inventory i JOIN "Product" p ON i."productId" = p.id
          WHERE i.quantity > 0`,
    args: [],
  })
  const liveRows = toObjs(liveInvResult)
  if (liveRows.length > 0) {
    const stmts = liveRows.map((r) => ({
      sql: `INSERT INTO "ShiftInventory" (id, "shiftId", "productId", "productName", quantity, "sellingPrice", "costPrice", category, "createdAt")
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        generateId(), openingId,
        r.productId, r.productName,
        (r.quantity as number) || 0,
        r.sellingPrice, r.costPrice, r.category || null,
        openingNow,
      ],
    }))
    await turso.batch(stmts)
  }
  console.log('[DayOpening] No valid source shift with snapshot data found; used current live inventory as baseline')
  return { ...defaultResult, created: true, inventorySynced: false }
}

async function ensureShiftTables() {
  await turso.execute(`CREATE TABLE IF NOT EXISTS "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "startedAt" TEXT NOT NULL,
    "endedAt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalSales" REAL NOT NULL DEFAULT 0,
    "totalTransactions" INTEGER NOT NULL DEFAULT 0,
    "totalItemsSold" INTEGER NOT NULL DEFAULT 0,
    "cashAtStart" REAL,
    "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TEXT NOT NULL
  )`)
  try { await turso.execute(`ALTER TABLE "Shift" ADD COLUMN "cashAtEnd" REAL`) } catch { /* column exists */ }
  try { await turso.execute(`ALTER TABLE "Shift" ADD COLUMN "expectedCash" REAL`) } catch { /* column exists */ }
  try { await turso.execute(`ALTER TABLE "Shift" ADD COLUMN "cashDiscrepancy" REAL`) } catch { /* column exists */ }

  await turso.execute(`CREATE TABLE IF NOT EXISTS "ShiftInventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "sellingPrice" REAL,
    "costPrice" REAL,
    "category" TEXT,
    "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE
  )`)
  try { await turso.execute(`CREATE INDEX IF NOT EXISTS "Shift_userId_idx" ON "Shift"("userId")`) } catch { /* */ }
  try { await turso.execute(`CREATE INDEX IF NOT EXISTS "Shift_status_idx" ON "Shift"("status")`) } catch { /* */ }
  try { await turso.execute(`CREATE INDEX IF NOT EXISTS "ShiftInventory_shiftId_idx" ON "ShiftInventory"("shiftId")`) } catch { /* */ }
  try { await turso.execute(`CREATE INDEX IF NOT EXISTS "ShiftInventory_productId_idx" ON "ShiftInventory"("productId")`) } catch { /* */ }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, shiftId, cashAtStart } = body
    const userId = request.headers.get('x-user-id') || ''
    const userName = request.headers.get('x-user-name') || ''
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    if (!isTurso()) return NextResponse.json({ error: 'Shift tracking requires cloud database' }, { status: 400 })

    // Ensure tables exist (self-healing)
    await ensureShiftTables()

    const now = new Date().toISOString()

    if (action === 'start') {
      // Check for stuck active shift
      const existing = await turso.execute({
        sql: `SELECT id, "startedAt" FROM "Shift" WHERE "userId" = ? AND status = 'ACTIVE'`,
        args: [userId],
      })
      if (existing.rows.length > 0) {
        const stuckId = existing.rows[0][0] as string
        const stuckStartedAt = existing.rows[0][1] as string
        // Auto-end the stuck shift (it was never properly closed)
        await turso.execute({
          sql: `UPDATE "Shift" SET status = 'ENDED', "endedAt" = ?, "updatedAt" = ? WHERE id = ?`,
          args: [now, now, stuckId],
        })
        // Capture inventory snapshot so the day-opening chain is never broken
        try { await captureInventorySnapshot(stuckId, now) } catch (e) {
          console.error(`[ShiftAutoEnd] Failed to capture snapshot for ${stuckId}:`, e)
        }
        // Return a warning but still allow starting fresh
        return NextResponse.json({
          id: stuckId, userId, userName,
          startedAt: stuckStartedAt, endedAt: now,
          status: 'AUTO_ENDED',
          warning: `Your previous shift (started ${new Date(stuckStartedAt).toLocaleTimeString()}) was not properly ended. It has been auto-closed. Please start a new shift.`,
        }, { status: 200 })
      }

      // ── Ensure day opening snapshot exists for today ──
      const dayOpening = await ensureDayOpeningSnapshot(now)

      const id = generateId()
      await turso.execute({
        sql: `INSERT INTO "Shift" (id, "userId", "userName", "startedAt", status, "cashAtStart", "createdAt", "updatedAt")
              VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
        args: [id, userId, userName, now, cashAtStart || null, now, now],
      })
      const response: Record<string, unknown> = { id, userId, userName, startedAt: now, cashAtStart, status: 'ACTIVE' }
      if (dayOpening.inventorySynced) {
        response.dayOpening = {
          inventorySynced: true,
          sourceDate: dayOpening.sourceDate,
          productsUpdated: dayOpening.productsUpdated,
        }
      }
      const { userId: aUid, ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId: aUid, action: 'SHIFT_OPENED', category: 'shift', entity: 'Shift', entityId: id, details: { cashAtStart }, ipAddress, userAgent }).catch(() => {})
      return NextResponse.json(response, { status: 201 })
    }

    if (action === 'end') {
      const sid = shiftId || ''
      if (!sid) return NextResponse.json({ error: 'shiftId is required' }, { status: 400 })

      const cashAtEnd = body.cashAtEnd !== undefined ? Number(body.cashAtEnd) : null

      const shiftResult = await turso.execute({
        sql: `SELECT id, "userId", "startedAt", "cashAtStart" FROM "Shift" WHERE id = ? AND status = 'ACTIVE'`,
        args: [sid],
      })
      if (shiftResult.rows.length === 0) {
        return NextResponse.json({ error: 'Active shift not found' }, { status: 404 })
      }
      const shift = shiftResult.rows[0]
      const startedAt = shift[2] as string
      const cashAtStart = (shift[3] as number) || 0

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

      // Cash reconciliation
      const expectedCash = cashAtStart + totalSales
      const cashDiscrepancy = cashAtEnd !== null ? expectedCash - cashAtEnd : null

      await turso.execute({
        sql: `UPDATE "Shift" SET status = 'ENDED', "endedAt" = ?,
                "totalSales" = ?, "totalTransactions" = ?, "totalItemsSold" = ?,
                "cashAtEnd" = ?, "expectedCash" = ?, "cashDiscrepancy" = ?,
                "updatedAt" = ?
                WHERE id = ?`,
        args: [now, totalSales, totalTransactions, totalItemsSold,
               cashAtEnd, expectedCash, cashDiscrepancy, now, sid],
      })

      // ── Capture inventory snapshot at shift end ──
      await captureInventorySnapshot(sid, now)

      const { userId: aUid2, ipAddress: aIp2, userAgent: aUa2 } = getRequestContext(request)
      writeAuditLog({ userId: aUid2, action: 'SHIFT_CLOSED', category: 'shift', entity: 'Shift', entityId: sid, details: { totalSales, totalTransactions, cashDiscrepancy }, ipAddress: aIp2, userAgent: aUa2 }).catch(() => {})
      return NextResponse.json({
        id: sid, userId, userName, startedAt, endedAt: now,
        status: 'ENDED', totalSales, totalTransactions, totalItemsSold,
        cashAtStart, cashAtEnd, expectedCash, cashDiscrepancy,
      })
    }

    return NextResponse.json({ error: 'Invalid action. Use action=start or action=end' }, { status: 400 })
  } catch (error) {
    console.error('Error managing shift:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to manage shift', detail: msg }, { status: 500 })
  }
}
