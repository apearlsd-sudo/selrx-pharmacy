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
      const variance = maxQty - minQty
      // dayChange = difference between first shift of today and previous day's end
      const firstShiftQty = shifts.length > 0 ? (quantities[shifts[0].id] || 0) : 0
      const dayChange = prevDayQty > 0 ? firstShiftQty - prevDayQty : 0

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
          variance,
          dayChange,
        })
      }
    }

    // Sort: highest variance first (most interesting for comparison)
    comparisonMatrix.sort((a, b) => b.variance - a.variance)

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
    })
  } catch (error) {
    console.error('Error fetching shift snapshots:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch shift snapshots', detail: msg }, { status: 500 })
  }
}
