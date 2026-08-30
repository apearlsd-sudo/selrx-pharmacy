import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, toObjs } from '@/lib/turso'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const period = searchParams.get('period') || ''
    const date = searchParams.get('date') || ''
    const month = searchParams.get('month') || ''

    const requesterRole = req.headers.get('x-user-role') || ''
    const requesterId = req.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'
    const userFilter = (!isSuperAdmin && requesterId)
      ? 'AND t."userId" = ?'
      : ''
    const userArgs = (!isSuperAdmin && requesterId) ? [requesterId] : []

    let dateFrom: string
    let dateTo: string
    let reportPeriod = 'custom'

    if (from || to) {
      // From/To date range (new style)
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      dateFrom = from || today
      dateTo = to || today
      if (dateFrom === dateTo) reportPeriod = 'daily'
      else reportPeriod = 'custom'
    } else if (period === 'monthly' && month) {
      const [y, m] = month.split('-').map(Number)
      dateFrom = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      dateTo = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      reportPeriod = 'monthly'
    } else if (period === 'daily' && date) {
      dateFrom = date
      dateTo = date
      reportPeriod = 'daily'
    } else {
      // Default to today
      const now = new Date()
      dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      dateTo = dateFrom
      reportPeriod = 'daily'
    }

    if (isTurso()) {
      return buildTursoReport(dateFrom, dateTo, reportPeriod, userFilter, userArgs)
    } else {
      return buildPrismaReport(dateFrom, dateTo, reportPeriod, isSuperAdmin, requesterId)
    }
  } catch (error) {
    console.error('Error generating financial report:', error)
    return NextResponse.json({ error: 'Failed to generate financial report' }, { status: 500 })
  }
}

async function buildTursoReport(
  dateFrom: string, dateTo: string, period: string,
  userFilter: string, userArgs: any[],
) {
  // 1. Revenue & COGS from completed transactions
  const txResult = await turso.execute({
    sql: `
      SELECT
        COUNT(*) as tx_count,
        COALESCE(SUM(t."total"), 0) as revenue,
        COALESCE(SUM(t."tax"), 0) as taxes,
        COALESCE(SUM(t."discount"), 0) as discounts
      FROM "Transaction" t
      WHERE t."status" = 'COMPLETED'
        AND date(t."createdAt") >= date(?)
        AND date(t."createdAt") <= date(?)
        ${userFilter}
    `,
    args: [dateFrom, dateTo, ...userArgs],
  })
  const txRow = txResult.rows[0]
  const transactionCount = Number(txRow?.tx_count || 0)
  const revenue = Number(txRow?.revenue || 0)
  const taxesCollected = Number(txRow?.taxes || 0)
  const totalDiscount = Number(txRow?.discounts || 0)

  // 2. COGS from transaction items (use product costPrice)
  const cogsResult = await turso.execute({
    sql: `
      SELECT COALESCE(SUM(ti."quantity" * COALESCE(p."costPrice", ti."unitPrice" * 0.6)), 0) as cogs
      FROM "TransactionItem" ti
      JOIN "Transaction" t ON t.id = ti."transactionId"
      LEFT JOIN "Product" p ON p.id = ti."productId"
      WHERE t."status" = 'COMPLETED'
        AND date(t."createdAt") >= date(?)
        AND date(t."createdAt") <= date(?)
        ${userFilter}
    `,
    args: [dateFrom, dateTo, ...userArgs],
  })
  const costOfGoodsSold = Number(cogsResult.rows[0]?.cogs || 0)

  // 3. Refunds
  const refundResult = await turso.execute({
    sql: `
      SELECT COALESCE(SUM(r."refundAmount"), 0) as total_refunds
      FROM "Return" r
      JOIN "Transaction" t ON t.id = r."transactionId"
      WHERE r."status" IN ('APPROVED', 'COMPLETED')
        AND date(r."createdAt") >= date(?)
        AND date(r."createdAt") <= date(?)
    `,
    args: [dateFrom, dateTo],
  })
  const refunds = Number(refundResult.rows[0]?.total_refunds || 0)

  // 4. Top selling products
  const topProductsResult = await turso.execute({
    sql: `
      SELECT ti."productName", SUM(ti."quantity") as qty, SUM(ti."subtotal") as rev
      FROM "TransactionItem" ti
      JOIN "Transaction" t ON t.id = ti."transactionId"
      WHERE t."status" = 'COMPLETED'
        AND date(t."createdAt") >= date(?)
        AND date(t."createdAt") <= date(?)
        ${userFilter}
      GROUP BY ti."productName"
      ORDER BY rev DESC
      LIMIT 20
    `,
    args: [dateFrom, dateTo, ...userArgs],
  })
  const topSellingProducts = toObjs(topProductsResult).map((r) => ({
    name: r.productName as string,
    qty: Number(r.qty),
    revenue: Number(r.rev),
  }))

  // 5. Payment method breakdown
  const paymentResult = await turso.execute({
    sql: `
      SELECT t."paymentMethod" as method, COUNT(*) as count, SUM(t."total") as amount
      FROM "Transaction" t
      WHERE t."status" = 'COMPLETED'
        AND date(t."createdAt") >= date(?)
        AND date(t."createdAt") <= date(?)
        ${userFilter}
      GROUP BY t."paymentMethod"
      ORDER BY amount DESC
    `,
    args: [dateFrom, dateTo, ...userArgs],
  })
  const paymentMethodBreakdown = toObjs(paymentResult).map((r) => ({
    method: r.method as string,
    count: Number(r.count),
    amount: Number(r.amount),
  }))

  // 6. Daily trend (for multi-day ranges)
  let dailyTrend: Array<{ date: string; revenue: number; cogs: number }> = []
  if (dateFrom !== dateTo) {
    const trendResult = await turso.execute({
      sql: `
        SELECT date(t."createdAt") as day,
          COALESCE(SUM(t."total"), 0) as revenue,
          COALESCE(SUM(ti."quantity" * COALESCE(p."costPrice", ti."unitPrice" * 0.6)), 0) as cogs
        FROM "Transaction" t
        JOIN "TransactionItem" ti ON ti."transactionId" = t.id
        LEFT JOIN "Product" p ON p.id = ti."productId"
        WHERE t."status" = 'COMPLETED'
          AND date(t."createdAt") >= date(?)
          AND date(t."createdAt") <= date(?)
          ${userFilter}
        GROUP BY day
        ORDER BY day
      `,
      args: [dateFrom, dateTo, ...userArgs],
    })
    dailyTrend = toObjs(trendResult).map((r) => ({
      date: r.day as string,
      revenue: Number(r.revenue),
      cogs: Number(r.cogs),
    }))
  }

  const grossProfit = revenue - costOfGoodsSold
  const netProfit = grossProfit - (revenue * 0.05) - totalDiscount // approx 5% opex

  return NextResponse.json({
    period,
    dateFrom,
    dateTo,
    revenue,
    costOfGoodsSold,
    grossProfit,
    netProfit,
    transactionCount,
    averageTransactionValue: transactionCount > 0 ? revenue / transactionCount : 0,
    refunds,
    taxesCollected: taxesCollected,
    totalDiscount,
    topSellingProducts,
    paymentMethodBreakdown,
    dailyTrend,
  })
}

async function buildPrismaReport(
  dateFrom: string, dateTo: string, period: string,
  _isSuperAdmin: boolean, _requesterId: string,
) {
  const { db } = await import('@/lib/db')

  const startDate = new Date(dateFrom + 'T00:00:00.000Z')
  const endDate = new Date(dateTo + 'T23:59:59.999Z')

  const transactions = await db.transaction.findMany({
    where: {
      status: 'COMPLETED',
      createdAt: { gte: startDate, lte: endDate },
    },
    include: { items: true },
  })

  const transactionCount = transactions.length
  const revenue = transactions.reduce((s, t) => s + t.total, 0)
  const taxesCollected = transactions.reduce((s, t) => s + t.tax, 0)
  const totalDiscount = transactions.reduce((s, t) => s + t.discount, 0)

  // COGS
  const productIds = [...new Set(transactions.flatMap((t) => t.items.map((i) => i.productId)))]
  const products = productIds.length > 0
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, costPrice: true } })
    : []
  const costMap = new Map(products.map((p) => [p.id, p.costPrice]))

  let costOfGoodsSold = 0
  const productRevenue = new Map<string, { qty: number; rev: number }>()
  for (const tx of transactions) {
    for (const item of tx.items) {
      const cost = costMap.get(item.productId) ?? item.unitPrice * 0.6
      costOfGoodsSold += item.quantity * cost
      const prev = productRevenue.get(item.productName) || { qty: 0, rev: 0 }
      prev.qty += item.quantity
      prev.rev += item.subtotal
      productRevenue.set(item.productName, prev)
    }
  }

  // Refunds
  const returnTxIds = transactions.map((t) => t.id)
  const refunds = returnTxIds.length > 0
    ? (await db.return.findMany({
        where: { transactionId: { in: returnTxIds }, status: { in: ['APPROVED', 'COMPLETED'] } },
      })).reduce((s, r) => s + r.refundAmount, 0)
    : 0

  // Top selling products
  const topSellingProducts = [...productRevenue.entries()]
    .map(([name, data]) => ({ name, qty: data.qty, revenue: data.rev }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20)

  // Payment method breakdown
  const paymentMap = new Map<string, { count: number; amount: number }>()
  for (const tx of transactions) {
    const prev = paymentMap.get(tx.paymentMethod) || { count: 0, amount: 0 }
    prev.count++
    prev.amount += tx.total
    paymentMap.set(tx.paymentMethod, prev)
  }
  const paymentMethodBreakdown = [...paymentMap.entries()]
    .map(([method, data]) => ({ method, ...data }))
    .sort((a, b) => b.amount - a.amount)

  // Daily trend
  let dailyTrend: Array<{ date: string; revenue: number; cogs: number }> = []
  if (dateFrom !== dateTo) {
    const dayMap = new Map<string, { revenue: number; cogs: number }>()
    for (const tx of transactions) {
      const day = tx.createdAt.toISOString().split('T')[0]
      const prev = dayMap.get(day) || { revenue: 0, cogs: 0 }
      prev.revenue += tx.total
      dayMap.set(day, prev)
      // Daily COGS
      for (const item of tx.items) {
        const cost = costMap.get(item.productId) ?? item.unitPrice * 0.6
        prev.cogs += item.quantity * cost
      }
    }
    dailyTrend = [...dayMap.entries()]
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  const grossProfit = revenue - costOfGoodsSold
  const netProfit = grossProfit - (revenue * 0.05) - totalDiscount

  return NextResponse.json({
    period,
    dateFrom,
    dateTo,
    revenue,
    costOfGoodsSold,
    grossProfit,
    netProfit,
    transactionCount,
    averageTransactionValue: transactionCount > 0 ? revenue / transactionCount : 0,
    refunds,
    taxesCollected,
    totalDiscount,
    topSellingProducts,
    paymentMethodBreakdown,
    dailyTrend,
  })
}
