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
// GET /api/shifts/discrepancy
//
// Compares the two most recent consecutive ended shifts and calculates
// inventory discrepancies (shortages / overs) per product.
//
// Query params:
//   shiftId  –  optional; analyse a specific shift vs its predecessor
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    if (!isTurso()) {
      return NextResponse.json({ error: 'Requires cloud database' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const specificShiftId = searchParams.get('shiftId')

    // ── 1. Determine the two shifts to compare ──
    let currentShift: Record<string, unknown> | null = null
    let previousShift: Record<string, unknown> | null = null

    if (specificShiftId) {
      // Find the specified shift and the one that ended immediately before it
      const target = await turso.execute({
        sql: `SELECT id, "userId", "userName", "startedAt", "endedAt",
                     "totalSales", "totalTransactions", "totalItemsSold"
              FROM "Shift" WHERE id = ? AND status = 'ENDED'`,
        args: [specificShiftId],
      })
      if (target.rows.length === 0) {
        return NextResponse.json({ error: 'Shift not found or not ended' }, { status: 404 })
      }
      currentShift = toObjs(target)[0]

      const prev = await turso.execute({
        sql: `SELECT id, "userId", "userName", "startedAt", "endedAt",
                     "totalSales", "totalTransactions", "totalItemsSold"
              FROM "Shift" WHERE status = 'ENDED' AND "endedAt" < ?
              ORDER BY "endedAt" DESC LIMIT 1`,
        args: [currentShift.endedAt],
      })
      previousShift = prev.rows.length > 0 ? toObjs(prev)[0] : null
    } else {
      // Default: compare the two most recently ended shifts
      const recent = await turso.execute({
        sql: `SELECT id, "userId", "userName", "startedAt", "endedAt",
                     "totalSales", "totalTransactions", "totalItemsSold"
              FROM "Shift" WHERE status = 'ENDED'
              ORDER BY "endedAt" DESC LIMIT 2`,
        args: [],
      })
      const rows = toObjs(recent)
      if (rows.length === 0) {
        return NextResponse.json({
          hasData: false,
          message: 'No ended shifts found. At least two completed shifts are needed for discrepancy analysis.',
        })
      }
      currentShift = rows[0]
      previousShift = rows.length > 1 ? rows[1] : null
    }

    if (!previousShift) {
      return NextResponse.json({
        hasData: false,
        message: 'Only one ended shift found. At least two completed shifts are needed to compare.',
        currentShift: {
          id: currentShift.id, userName: currentShift.userName,
          startedAt: currentShift.startedAt, endedAt: currentShift.endedAt,
        },
      })
    }

    // ── 2. Get previous shift's inventory snapshot ──
    const prevInvResult = await turso.execute({
      sql: `SELECT "productId", "productName", quantity, "sellingPrice", "costPrice"
            FROM "ShiftInventory" WHERE "shiftId" = ?`,
      args: [previousShift.id],
    })
    const prevInvMap: Record<string, { productName: string; quantity: number; sellingPrice: number; costPrice: number }> = {}
    for (const r of toObjs(prevInvResult)) {
      prevInvMap[r.productId as string] = {
        productName: (r.productName as string) || 'Unknown',
        quantity: (r.quantity as number) || 0,
        sellingPrice: (r.sellingPrice as number) || 0,
        costPrice: (r.costPrice as number) || 0,
      }
    }

    // ── 3. Get current shift's inventory snapshot ──
    const curInvResult = await turso.execute({
      sql: `SELECT "productId", "productName", quantity, "sellingPrice", "costPrice"
            FROM "ShiftInventory" WHERE "shiftId" = ?`,
      args: [currentShift.id],
    })
    const curInvMap: Record<string, { productName: string; quantity: number; sellingPrice: number; costPrice: number }> = {}
    for (const r of toObjs(curInvResult)) {
      curInvMap[r.productId as string] = {
        productName: (r.productName as string) || 'Unknown',
        quantity: (r.quantity as number) || 0,
        sellingPrice: (r.sellingPrice as number) || 0,
        costPrice: (r.costPrice as number) || 0,
      }
    }

    // ── 4. Get items sold during current shift ──
    const currentStartedAt = currentShift.startedAt as string
    const currentEndedAt = currentShift.endedAt as string
    const currentUserId = currentShift.userId as string

    const soldResult = await turso.execute({
      sql: `SELECT ti."productId", ti."productName",
                   SUM(ti.quantity) as totalQty, SUM(ti.subtotal) as totalRevenue
            FROM TransactionItem ti
            JOIN "Transaction" t ON ti."transactionId" = t.id
            WHERE t."userId" = ? AND t.status = 'COMPLETED'
              AND t."createdAt" >= ? AND t."createdAt" <= ?
            GROUP BY ti."productId", ti."productName"`,
      args: [currentUserId, currentStartedAt, currentEndedAt],
    })
    const soldMap: Record<string, { productName: string; quantitySold: number; revenue: number }> = {}
    for (const r of toObjs(soldResult)) {
      soldMap[r.productId as string] = {
        productName: (r.productName as string) || 'Unknown',
        quantitySold: (r.totalQty as number) || 0,
        revenue: (r.totalRevenue as number) || 0,
      }
    }

    // ── 5. If no snapshot for current shift, use live inventory ──
    let usingLiveInventory = false
    if (Object.keys(curInvMap).length === 0) {
      usingLiveInventory = true
      const liveInv = await turso.execute({
        sql: `SELECT i."productId", p.name as "productName", i.quantity,
                     p."sellingPrice", p."costPrice"
              FROM Inventory i JOIN "Product" p ON i."productId" = p.id
              WHERE i.quantity > 0`,
        args: [],
      })
      for (const r of toObjs(liveInv)) {
        curInvMap[r.productId as string] = {
          productName: (r.productName as string) || 'Unknown',
          quantity: (r.quantity as number) || 0,
          sellingPrice: (r.sellingPrice as number) || 0,
          costPrice: (r.costPrice as number) || 0,
        }
      }
    }

    // ── 6. Build discrepancy list ──
    // Collect ALL product IDs from previous snapshot, current snapshot, and sales
    const allProductIds = new Set<string>([
      ...Object.keys(prevInvMap),
      ...Object.keys(curInvMap),
      ...Object.keys(soldMap),
    ])

    const discrepancies: Array<{
      productId: string
      productName: string
      previousStock: number
      qtySold: number
      expectedStock: number
      actualStock: number
      discrepancy: number  // positive = shortage, negative = over
      unitCost: number
      discrepancyCost: number
    }> = []

    for (const pid of allProductIds) {
      const prev = prevInvMap[pid]
      const cur = curInvMap[pid]
      const sold = soldMap[pid]

      const previousStock = prev?.quantity || 0
      const qtySold = sold?.quantitySold || 0
      const expectedStock = Math.max(0, previousStock - qtySold)
      const actualStock = cur?.quantity || 0
      const discrepancy = expectedStock - actualStock  // +ve = shortage, -ve = over

      // Only include products where there's an actual discrepancy
      if (discrepancy === 0) continue

      const unitCost = cur?.costPrice || prev?.costPrice || cur?.sellingPrice || prev?.sellingPrice || 0
      const productName = cur?.productName || prev?.productName || sold?.productName || 'Unknown'

      discrepancies.push({
        productId: pid,
        productName,
        previousStock,
        qtySold,
        expectedStock,
        actualStock,
        discrepancy,
        unitCost,
        discrepancyCost: Math.abs(discrepancy) * unitCost,
      })
    }

    // Sort: shortages first (desc), then overs (asc)
    discrepancies.sort((a, b) => {
      if (a.discrepancy > 0 && b.discrepancy > 0) return b.discrepancy - a.discrepancy
      if (a.discrepancy < 0 && b.discrepancy < 0) return a.discrepancy - b.discrepancy
      return b.discrepancy - a.discrepancy
    })

    const totalShortageCost = discrepancies
      .filter((d) => d.discrepancy > 0)
      .reduce((s, d) => s + d.discrepancyCost, 0)
    const totalOverCost = discrepancies
      .filter((d) => d.discrepancy < 0)
      .reduce((s, d) => s + d.discrepancyCost, 0)
    const shortageCount = discrepancies.filter((d) => d.discrepancy > 0).length
    const overCount = discrepancies.filter((d) => d.discrepancy < 0).length

    return NextResponse.json({
      hasData: true,
      usingLiveInventory,
      previousShift: {
        id: previousShift.id, userId: previousShift.userId,
        userName: previousShift.userName, startedAt: previousShift.startedAt,
        endedAt: previousShift.endedAt, totalSales: previousShift.totalSales,
        totalTransactions: previousShift.totalTransactions,
      },
      currentShift: {
        id: currentShift.id, userId: currentShift.userId,
        userName: currentShift.userName, startedAt: currentShift.startedAt,
        endedAt: currentShift.endedAt, totalSales: currentShift.totalSales,
        totalTransactions: currentShift.totalTransactions,
      },
      summary: {
        totalDiscrepancies: discrepancies.length,
        shortageCount,
        overCount,
        totalShortageCost,
        totalOverCost,
        netCost: totalShortageCost - totalOverCost,
      },
      discrepancies,
    })
  } catch (error) {
    console.error('Error computing discrepancy:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to compute discrepancy', detail: msg }, { status: 500 })
  }
}
