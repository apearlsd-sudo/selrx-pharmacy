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
// Finds all ended shifts for a given day (default: today), identifies
// handoff points where the user changes between consecutive shifts,
// and calculates inventory discrepancies (shortages / overs) per handoff.
//
// Query params:
//   date     –  YYYY-MM-DD (default: today)
//   shiftId  –  optional; analyse a specific shift vs its predecessor
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    if (!isTurso()) {
      return NextResponse.json({ error: 'Requires cloud database' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const specificShiftId = searchParams.get('shiftId')
    const dateParam = searchParams.get('date')

    // If a specific shiftId is given, analyse that shift vs its predecessor
    if (specificShiftId) {
      return analyseSingleHandoff(specificShiftId)
    }

    // Otherwise, analyse all handoffs for the day
    const today = new Date()
    const dateStr = dateParam || today.toISOString().split('T')[0]
    const dayStart = new Date(dateStr + 'T00:00:00.000Z').toISOString()
    const dayEnd = new Date(dateStr + 'T23:59:59.999Z').toISOString()

    return analyseDayHandoffs(dayStart, dayEnd, dateStr)
  } catch (error) {
    console.error('Error computing discrepancy:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to compute discrepancy', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Analyse all user handoffs within a day
// ---------------------------------------------------------------------------

async function analyseDayHandoffs(dayStart: string, dayEnd: string, dateStr: string) {
  // Get all ended shifts for the day, ordered chronologically
  const shiftsResult = await turso.execute({
    sql: `SELECT id, "userId", "userName", "startedAt", "endedAt",
                 "totalSales", "totalTransactions", "totalItemsSold"
          FROM "Shift"
          WHERE status = 'ENDED' AND "startedAt" >= ? AND "startedAt" <= ?
          ORDER BY "startedAt" ASC`,
    args: [dayStart, dayEnd],
  })
  const shifts = toObjs(shiftsResult)

  if (shifts.length === 0) {
    return NextResponse.json({
      hasData: false,
      date: dateStr,
      message: 'No completed shifts found for this day. At least two shifts by different users are needed.',
    })
  }

  // Find handoff pairs: consecutive shifts where the user changes
  const handoffs: Array<{ previousShift: any; currentShift: any }> = []
  for (let i = 1; i < shifts.length; i++) {
    if (shifts[i].userId !== shifts[i - 1].userId) {
      handoffs.push({ previousShift: shifts[i - 1], currentShift: shifts[i] })
    }
  }

  if (handoffs.length === 0) {
    // All shifts were by the same user — no handoff to compare
    const uniqueUsers = new Set(shifts.map((s) => s.userId))
    if (uniqueUsers.size === 1) {
      return NextResponse.json({
        hasData: false,
        date: dateStr,
        message: `All ${shifts.length} shift(s) today were by ${shifts[0].userName}. At least two different users are needed for discrepancy analysis.`,
      })
    }
    return NextResponse.json({
      hasData: false,
      date: dateStr,
      message: 'No user handoffs found. Shifts by the same user are not compared.',
    })
  }

  // Compute discrepancies for each handoff
  const comparisons = []
  for (const { previousShift, currentShift } of handoffs) {
    const result = await computeDiscrepancy(previousShift, currentShift)
    comparisons.push(result)
  }

  // Aggregate summary across all handoffs
  const allDiscrepancies = comparisons.flatMap((c) => c.discrepancies)
  const totalShortageCost = allDiscrepancies
    .filter((d) => d.discrepancy > 0)
    .reduce((s, d) => s + d.discrepancyCost, 0)
  const totalOverCost = allDiscrepancies
    .filter((d) => d.discrepancy < 0)
    .reduce((s, d) => s + d.discrepancyCost, 0)
  const shortageCount = allDiscrepancies.filter((d) => d.discrepancy > 0).length
  const overCount = allDiscrepancies.filter((d) => d.discrepancy < 0).length

  return NextResponse.json({
    hasData: true,
    date: dateStr,
    totalShifts: shifts.length,
    totalHandoffs: handoffs.length,
    summary: {
      totalDiscrepancies: allDiscrepancies.length,
      shortageCount,
      overCount,
      totalShortageCost,
      totalOverCost,
      netCost: totalShortageCost - totalOverCost,
    },
    comparisons,
  })
}

// ---------------------------------------------------------------------------
// Analyse a single specific shift vs its predecessor
// ---------------------------------------------------------------------------

async function analyseSingleHandoff(shiftId: string) {
  const target = await turso.execute({
    sql: `SELECT id, "userId", "userName", "startedAt", "endedAt",
                 "totalSales", "totalTransactions", "totalItemsSold"
          FROM "Shift" WHERE id = ? AND status = 'ENDED'`,
    args: [shiftId],
  })
  if (target.rows.length === 0) {
    return NextResponse.json({ error: 'Shift not found or not ended' }, { status: 404 })
  }
  const currentShift = toObjs(target)[0]

  const prev = await turso.execute({
    sql: `SELECT id, "userId", "userName", "startedAt", "endedAt",
                 "totalSales", "totalTransactions", "totalItemsSold"
          FROM "Shift" WHERE status = 'ENDED' AND "endedAt" <= ?
          ORDER BY "endedAt" DESC LIMIT 1`,
    args: [currentShift.startedAt as string],
  })
  const previousShift = prev.rows.length > 0 ? toObjs(prev)[0] : null

  if (!previousShift) {
    return NextResponse.json({
      hasData: false,
      message: 'No previous shift found to compare against.',
    })
  }

  // Skip if same user
  if (previousShift.userId === currentShift.userId) {
    return NextResponse.json({
      hasData: false,
      message: `Both shifts were by ${currentShift.userName}. Discrepancy analysis is between different users.`,
    })
  }

  const result = await computeDiscrepancy(previousShift, currentShift)

  return NextResponse.json({
    hasData: true,
    date: (currentShift.endedAt as string).split('T')[0],
    totalShifts: 2,
    totalHandoffs: 1,
    summary: {
      totalDiscrepancies: result.discrepancies.length,
      shortageCount: result.discrepancies.filter((d: any) => d.discrepancy > 0).length,
      overCount: result.discrepancies.filter((d: any) => d.discrepancy < 0).length,
      totalShortageCost: result.discrepancies.filter((d: any) => d.discrepancy > 0).reduce((s: number, d: any) => s + d.discrepancyCost, 0),
      totalOverCost: result.discrepancies.filter((d: any) => d.discrepancy < 0).reduce((s: number, d: any) => s + d.discrepancyCost, 0),
      netCost: result.discrepancies.reduce((s: number, d: any) => s + (d.discrepancy > 0 ? d.discrepancyCost : -d.discrepancyCost), 0),
    },
    comparisons: [result],
  })
}

// ---------------------------------------------------------------------------
// Core discrepancy computation between two shifts
// ---------------------------------------------------------------------------

async function computeDiscrepancy(previousShift: Record<string, unknown>, currentShift: Record<string, unknown>) {
  // 1. Previous shift's inventory snapshot
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

  // 2. Current shift's inventory snapshot
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

  // 3. Items sold during current shift
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

  // 4. If no snapshot for current shift, use live inventory
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

  // 5. Build discrepancy list
  const allProductIds = new Set<string>([
    ...Object.keys(prevInvMap),
    ...Object.keys(curInvMap),
    ...Object.keys(soldMap),
  ])

  const discrepancies: Array<{
    productId: string; productName: string
    previousStock: number; qtySold: number
    expectedStock: number; actualStock: number
    discrepancy: number; unitCost: number; discrepancyCost: number
  }> = []

  for (const pid of allProductIds) {
    const prev = prevInvMap[pid]
    const cur = curInvMap[pid]
    const sold = soldMap[pid]

    const previousStock = prev?.quantity || 0
    const qtySold = sold?.quantitySold || 0
    const expectedStock = Math.max(0, previousStock - qtySold)
    const actualStock = cur?.quantity || 0
    const discrepancy = expectedStock - actualStock // +ve = shortage, -ve = over

    if (discrepancy === 0) continue

    const unitCost = cur?.costPrice || prev?.costPrice || cur?.sellingPrice || prev?.sellingPrice || 0
    const productName = cur?.productName || prev?.productName || sold?.productName || 'Unknown'

    discrepancies.push({
      productId: pid, productName,
      previousStock, qtySold, expectedStock, actualStock,
      discrepancy, unitCost,
      discrepancyCost: Math.abs(discrepancy) * unitCost,
    })
  }

  // Sort: shortages first (desc), then overs (asc)
  discrepancies.sort((a, b) => {
    if (a.discrepancy > 0 && b.discrepancy > 0) return b.discrepancy - a.discrepancy
    if (a.discrepancy < 0 && b.discrepancy < 0) return a.discrepancy - b.discrepancy
    return b.discrepancy - a.discrepancy
  })

  const shortageCost = discrepancies.filter((d) => d.discrepancy > 0).reduce((s, d) => s + d.discrepancyCost, 0)
  const overCost = discrepancies.filter((d) => d.discrepancy < 0).reduce((s, d) => s + d.discrepancyCost, 0)

  return {
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
    handoffSummary: {
      totalDiscrepancies: discrepancies.length,
      shortageCount: discrepancies.filter((d) => d.discrepancy > 0).length,
      overCount: discrepancies.filter((d) => d.discrepancy < 0).length,
      shortageCost,
      overCost,
      netCost: shortageCost - overCost,
    },
    discrepancies,
  }
}
