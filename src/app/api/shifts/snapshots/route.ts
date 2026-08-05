import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

function toObjs(result: { columns: Array<string>; rows: Array<Array<unknown>> }) {
  const names = result.columns.map((c) => c)
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((n, i) => { obj[n] = row[i] })
    return obj
  })
}

// ---------------------------------------------------------------------------
// GET /api/shifts/snapshots
//
// Fetches inventory snapshots for shifts on a given date.
// Used for daily accounting: comparing stock snapshots across users
// and reconciling physical cash at hand.
//
// Query params:
//   date   –  YYYY-MM-DD (required)
//   userId –  optional; filter to a specific user's shifts
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    if (!isTurso()) {
      return NextResponse.json({ error: 'Requires cloud database' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const userIdFilter = searchParams.get('userId')

    if (!dateParam) {
      return NextResponse.json({ error: 'date parameter is required (YYYY-MM-DD)' }, { status: 400 })
    }

    const dayStart = new Date(dateParam + 'T00:00:00.000Z').toISOString()
    const dayEnd = new Date(dateParam + 'T23:59:59.999Z').toISOString()

    // 1. Get all ended shifts for the day
    const shiftConditions = [`status = 'ENDED'`, `"startedAt" >= ?`, `"startedAt" <= ?`]
    const shiftArgs: unknown[] = [dayStart, dayEnd]
    if (userIdFilter) {
      shiftConditions.push(`"userId" = ?`)
      shiftArgs.push(userIdFilter)
    }

    const shiftsResult = await turso.execute({
      sql: `SELECT id, "userId", "userName", "startedAt", "endedAt",
                  "totalSales", "totalTransactions", "totalItemsSold",
                  "cashAtStart", "cashAtEnd", "expectedCash", "cashDiscrepancy"
           FROM "Shift"
           WHERE ${shiftConditions.join(' AND ')}
           ORDER BY "startedAt" ASC`,
      args: shiftArgs,
    })
    const shifts = toObjs(shiftsResult)

    if (shifts.length === 0) {
      return NextResponse.json({
        date: dateParam,
        shifts: [],
        message: 'No completed shifts found for this date',
      })
    }

    // 2. Fetch inventory snapshots for all shifts in one batch query
    const shiftIds = shifts.map((s) => s.id)
    // Turso doesn't support IN with many params well, so query individually but in parallel
    const snapshotPromises = shiftIds.map(async (sid) => {
      const invResult = await turso.execute({
        sql: `SELECT si."productId", si."productName", si.quantity, si."sellingPrice", si."costPrice",
                     p.category
              FROM "ShiftInventory" si
              LEFT JOIN "Product" p ON si."productId" = p.id
              WHERE si."shiftId" = ?
              ORDER BY si."productName" ASC`,
        args: [sid],
      })
      return { shiftId: sid, items: toObjs(invResult) }
    })
    const snapshots = await Promise.all(snapshotPromises)

    // 3. Build snapshot map
    const snapshotMap: Record<string, any[]> = {}
    let totalSnapshotItems = 0
    for (const snap of snapshots) {
      snapshotMap[snap.shiftId] = snap.items
      totalSnapshotItems += snap.items.length
    }

    // 4. Build daily cash accounting summary
    const cashAccounting = shifts.map((s) => ({
      shiftId: s.id,
      userId: s.userId,
      userName: s.userName,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      totalSales: (s.totalSales as number) || 0,
      totalTransactions: (s.totalTransactions as number) || 0,
      totalItemsSold: (s.totalItemsSold as number) || 0,
      cashAtStart: (s.cashAtStart as number) ?? null,
      cashAtEnd: (s.cashAtEnd as number) ?? null,
      expectedCash: (s.expectedCash as number) ?? null,
      cashDiscrepancy: (s.cashDiscrepancy as number) ?? null,
      snapshotItemCount: (snapshotMap[s.id] || []).length,
      snapshotTotalValue: (snapshotMap[s.id] || []).reduce(
        (sum: number, item: any) => sum + ((item.quantity as number) || 0) * ((item.sellingPrice as number) || 0),
        0
      ),
      snapshotTotalCost: (snapshotMap[s.id] || []).reduce(
        (sum: number, item: any) => sum + ((item.quantity as number) || 0) * ((item.costPrice as number) || 0),
        0
      ),
    }))

    // 5. Daily aggregates
    const dailySummary = {
      totalShifts: shifts.length,
      uniqueUsers: new Set(shifts.map((s) => s.userId)).size,
      totalSales: cashAccounting.reduce((s, c) => s + c.totalSales, 0),
      totalTransactions: cashAccounting.reduce((s, c) => s + c.totalTransactions, 0),
      totalItemsSold: cashAccounting.reduce((s, c) => s + c.totalItemsSold, 0),
      totalCashAtEnd: cashAccounting
        .filter((c) => c.cashAtEnd !== null)
        .reduce((s, c) => s + (c.cashAtEnd as number), 0),
      totalExpectedCash: cashAccounting
        .filter((c) => c.expectedCash !== null)
        .reduce((s, c) => s + (c.expectedCash as number), 0),
      totalCashDiscrepancy: cashAccounting
        .filter((c) => c.cashDiscrepancy !== null)
        .reduce((s, c) => s + (c.cashDiscrepancy as number), 0),
      hasCashData: cashAccounting.some((c) => c.cashAtEnd !== null),
    }

    // 5b. Fetch previous day's last shift inventory as baseline
    const prevDate = new Date(dateParam + 'T00:00:00.000Z')
    prevDate.setDate(prevDate.getDate() - 1)
    const prevDayStart = new Date(prevDate.toISOString().split('T')[0] + 'T00:00:00.000Z').toISOString()
    const prevDayEnd = new Date(prevDate.toISOString().split('T')[0] + 'T23:59:59.999Z').toISOString()

    let previousDayBaseline: { shiftId: string; userName: string; endedAt: string; items: any[] } | null = null
    try {
      const prevShiftsResult = await turso.execute({
        sql: `SELECT id, "userName", "endedAt"
             FROM "Shift"
             WHERE status = 'ENDED' AND "startedAt" >= ? AND "startedAt" <= ?
             ORDER BY "endedAt" DESC
             LIMIT 1`,
        args: [prevDayStart, prevDayEnd],
      })
      const prevShifts = toObjs(prevShiftsResult)
      if (prevShifts.length > 0) {
        const lastPrevShift = prevShifts[0]
        const prevInvResult = await turso.execute({
          sql: `SELECT si."productId", si."productName", si.quantity, si."sellingPrice", si."costPrice",
                       p.category
                FROM "ShiftInventory" si
                LEFT JOIN "Product" p ON si."productId" = p.id
                WHERE si."shiftId" = ?
                ORDER BY si."productName" ASC`,
          args: [lastPrevShift.id],
        })
        const prevItems = toObjs(prevInvResult)
        if (prevItems.length > 0) {
          previousDayBaseline = {
            shiftId: lastPrevShift.id as string,
            userName: (lastPrevShift.userName as string) || 'Previous Day',
            endedAt: (lastPrevShift.endedAt as string) || '',
            items: prevItems,
          }
        }
      }
    } catch (e) {
      // Non-critical — log but don't fail the whole request
      console.warn('Could not fetch previous day baseline:', e)
    }

    // 5c. Detect products that expired between previous day snapshot and today
    // This prevents false variance alerts for stock lost to expiry
    const expiredSinceLastShift: Array<{
      productId: string
      productName: string
      category: string
      costPrice: number
      expiredBatches: Array<{ batchNumber: string | null; expiryDate: string; quantity: number }>
      totalExpiredQty: number
      costLoss: number
    }> = []
    const expiredProductIds = new Set<string>()
    const expiredProductQty: Record<string, number> = {}

    if (previousDayBaseline) {
      try {
        // The prev day snapshot was taken at prevDayBaseline.endedAt.
        // Anything with expiryDate <= today's date and > previous day's date qualifies.
        // Also check Product.expiredAt for products explicitly marked expired.
        const prevDayDate = prevDate.toISOString().split('T')[0] // YYYY-MM-DD of prev day
        const todayDate = dateParam // YYYY-MM-DD of requested date

        // Query 1: Batches with expiryDate between prev day and today (inclusive)
        const expiredBatchesResult = await turso.execute({
          sql: `SELECT b."productId", b."batchNumber", b."expiryDate", b.quantity, b."costPrice",
                       p.name as "productName", p.category
                FROM "Batch" b
                LEFT JOIN "Product" p ON b."productId" = p.id
                WHERE b."expiryDate" IS NOT NULL
                  AND b."expiryDate" >= ?
                  AND b."expiryDate" <= ?
                  AND b.quantity > 0`,
          args: [prevDayDate, todayDate],
        })
        const expiredBatches = toObjs(expiredBatchesResult)

        // Group by productId
        const batchByProduct: Record<string, Array<{ batchNumber: string | null; expiryDate: string; quantity: number; costPrice: number }>> = {}
        for (const b of expiredBatches) {
          const pid = b.productId as string
          if (!batchByProduct[pid]) batchByProduct[pid] = []
          batchByProduct[pid].push({
            batchNumber: b.batchNumber as string | null,
            expiryDate: b.expiryDate as string,
            quantity: (b.quantity as number) || 0,
            costPrice: (b.costPrice as number) || 0,
          })
          expiredProductIds.add(pid)
          expiredProductQty[pid] = (expiredProductQty[pid] || 0) + ((b.quantity as number) || 0)
        }

        // Query 2: Products explicitly marked expired (expiredAt field) between prev day and today
        const expiredProductsResult = await turso.execute({
          sql: `SELECT id, name, category, "expiredAt", "costPrice"
                FROM "Product"
                WHERE "expiredAt" IS NOT NULL
                  AND "expiredAt" >= ?
                  AND "expiredAt" <= ?`,
          args: [prevDayDate, todayDate],
        })
        const expiredProducts = toObjs(expiredProductsResult)
        for (const ep of expiredProducts) {
          const pid = ep.id as string
          if (!expiredProductIds.has(pid)) {
            expiredProductIds.add(pid)
          }
        }

        // Build expiredSinceLastShift array (only for products that were in prev day baseline)
        for (const prevItem of previousDayBaseline.items) {
          const pid = prevItem.productId as string
          if (expiredProductIds.has(pid) || batchByProduct[pid]) {
            const batches = batchByProduct[pid] || []
            const totalExpiredQty = batches.reduce((s, b) => s + b.quantity, 0)
            const avgCost = batches.length > 0
              ? batches.reduce((s, b) => s + b.costPrice, 0) / batches.length
              : ((prevItem.costPrice as number) || 0)
            expiredSinceLastShift.push({
              productId: pid,
              productName: (prevItem.productName as string) || 'Unknown',
              category: (prevItem.category as string) || '',
              costPrice: avgCost,
              expiredBatches: batches,
              totalExpiredQty,
              costLoss: totalExpiredQty * avgCost,
            })
          }
        }
      } catch (e) {
        console.warn('Could not fetch expired batch data:', e)
      }
    }

    // 6. Build a merged product comparison across all shifts
    // For each product that appears in any snapshot (including previous day baseline), show qty per shift
    const allProductIds = new Set<string>()
    for (const snap of snapshots) {
      for (const item of snap.items) {
        allProductIds.add(item.productId as string)
      }
    }
    // Also include products from previous day baseline
    if (previousDayBaseline) {
      for (const item of previousDayBaseline.items) {
        allProductIds.add(item.productId as string)
      }
    }

    // Get product names from first occurrence (including previous day baseline)
    const productNames: Record<string, string> = {}
    const productCategories: Record<string, string> = {}
    const productCostPrices: Record<string, number> = {}
    for (const snap of snapshots) {
      for (const item of snap.items) {
        if (!productNames[item.productId as string]) {
          productNames[item.productId as string] = (item.productName as string) || 'Unknown'
        }
        if (!productCategories[item.productId as string] && item.category) {
          productCategories[item.productId as string] = item.category as string
        }
        if (!productCostPrices[item.productId as string]) {
          productCostPrices[item.productId as string] = (item.costPrice as number) || 0
        }
      }
    }
    if (previousDayBaseline) {
      for (const item of previousDayBaseline.items) {
        if (!productNames[item.productId as string]) {
          productNames[item.productId as string] = (item.productName as string) || 'Unknown'
        }
        if (!productCategories[item.productId as string] && item.category) {
          productCategories[item.productId as string] = item.category as string
        }
        if (!productCostPrices[item.productId as string]) {
          productCostPrices[item.productId as string] = (item.costPrice as number) || 0
        }
      }
    }

    // Build comparison matrix: product -> shiftId -> quantity
    const comparisonMatrix: Array<{
      productId: string
      productName: string
      category: string
      costPrice: number
      quantities: Record<string, number>
      prevDayQty: number
      minQty: number
      maxQty: number
      variance: number
      dayChange: number
      expiryRelated: boolean
      adjustedVariance: number
      adjustedDayChange: number
    }> = []

    for (const pid of allProductIds) {
      const quantities: Record<string, number> = {}
      for (const s of shifts) {
        const items = snapshotMap[s.id] || []
        const found = items.find((i: any) => i.productId === pid)
        quantities[s.id] = found ? ((found.quantity as number) || 0) : 0
      }
      // Previous day baseline quantity
      const prevItems = previousDayBaseline?.items || []
      const prevFound = prevItems.find((i: any) => i.productId === pid)
      const prevDayQty = prevFound ? ((prevFound.quantity as number) || 0) : 0

      const qtyValues = Object.values(quantities)
      const minQty = Math.min(...qtyValues)
      const maxQty = Math.max(...qtyValues)
      const rawVariance = maxQty - minQty
      // dayChange = difference between first shift of today and previous day's end
      const firstShiftQty = shifts.length > 0 ? (quantities[shifts[0].id] || 0) : 0
      const rawDayChange = prevDayQty > 0 ? firstShiftQty - prevDayQty : 0

      // Check if this product's variance is explained by expiry
      const isExpiredRelated = expiredProductIds.has(pid)
      const expiredQty = expiredProductQty[pid] || 0

      // Adjust variance: if the drop matches expired quantity, remove it from variance
      let adjustedVariance = rawVariance
      let adjustedDayChange = rawDayChange
      if (isExpiredRelated && prevDayBaseline) {
        // For dayChange: if we had prevDayQty and now have less, the drop explained by expiry shouldn't count
        if (rawDayChange < 0) {
          const drop = Math.abs(rawDayChange)
          const explainedByExpiry = Math.min(drop, expiredQty)
          adjustedDayChange = rawDayChange + explainedByExpiry // reduces the negative (e.g. -30 + 30 = 0)
        }
        // For variance across shifts: similar logic using the expired quantity
        if (rawVariance > 0 && prevDayQty > 0) {
          const explainedByExpiry = Math.min(rawVariance, expiredQty)
          adjustedVariance = Math.max(0, rawVariance - explainedByExpiry)
        }
      }

      // Only include products that appear in at least one snapshot
      const overallMax = Math.max(maxQty, prevDayQty)
      if (overallMax > 0) {
        comparisonMatrix.push({
          productId: pid,
          productName: productNames[pid] || 'Unknown',
          category: productCategories[pid] || '',
          costPrice: productCostPrices[pid] || 0,
          quantities,
          prevDayQty,
          minQty,
          maxQty,
          variance: rawVariance,
          dayChange: rawDayChange,
          expiryRelated: isExpiredRelated,
          adjustedVariance,
          adjustedDayChange,
        })
      }
    }

    // Sort: highest variance first (most interesting for comparison)
    comparisonMatrix.sort((a, b) => b.variance - a.variance)

    // 7. Summary stats for expired items
    const expiredSummary = {
      totalProducts: expiredSinceLastShift.length,
      totalExpiredQty: expiredSinceLastShift.reduce((s, e) => s + e.totalExpiredQty, 0),
      totalCostLoss: expiredSinceLastShift.reduce((s, e) => s + e.costLoss, 0),
    }

    return NextResponse.json({
      date: dateParam,
      shifts: cashAccounting,
      dailySummary,
      snapshotMap,
      comparisonMatrix,
      previousDayBaseline: previousDayBaseline
        ? {
            shiftId: previousDayBaseline.shiftId,
            userName: previousDayBaseline.userName,
            endedAt: previousDayBaseline.endedAt,
            itemCount: previousDayBaseline.items.length,
          }
        : null,
      expiredSinceLastShift,
      expiredSummary,
    })
  } catch (error) {
    console.error('Error fetching shift snapshots:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch shift snapshots', detail: msg }, { status: 500 })
  }
}
