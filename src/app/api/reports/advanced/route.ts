import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toObjs(result: { columns: Array<string>; rows: Array<Array<unknown>> }) {
  const names = result.columns.map((c) => c)
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((n, i) => { obj[n] = row[i] })
    return obj
  })
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function samePeriodLastRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from)
  const t = new Date(to)
  const diffMs = t.getTime() - f.getTime()
  const prevTo = new Date(f.getTime() - 1 * 86400000)
  const prevFrom = new Date(prevTo.getTime() - diffMs)
  return {
    from: `${prevFrom.getFullYear()}-${String(prevFrom.getMonth() + 1).padStart(2, '0')}-${String(prevFrom.getDate()).padStart(2, '0')}`,
    to: `${prevTo.getFullYear()}-${String(prevTo.getMonth() + 1).padStart(2, '0')}-${String(prevTo.getDate()).padStart(2, '0')}`,
  }
}

// ---------------------------------------------------------------------------
// GET /api/reports/advanced?type=revenue|profit|customers|expiry|payments|comparison
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'revenue'
    const from = searchParams.get('from') || daysAgo(30)
    const to = searchParams.get('to') || todayStr()

    const requesterRole = req.headers.get('x-user-role') || ''
    const requesterId = req.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    if (isTurso()) {
      const userFilter = (!isSuperAdmin && requesterId)
        ? 'AND t."userId" = ?'
        : ''
      const userArgs = (!isSuperAdmin && requesterId) ? [requesterId] : []

      switch (type) {
        case 'revenue':
          return revenueReport(from, to, userFilter, userArgs)
        case 'profit':
          return profitReport(from, to, userFilter, userArgs)
        case 'customers':
          return customerReport(from, to, userFilter, userArgs)
        case 'expiry':
          return expiryReport()
        case 'payments':
          return paymentReport(from, to, userFilter, userArgs)
        case 'comparison':
          return comparisonReport(from, to, userFilter, userArgs)
        default:
          return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
      }
    }

    // Prisma fallback
    return prismaFallback(type, from, to, isSuperAdmin, requesterId)
  } catch (error) {
    console.error('GET /api/reports/advanced error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Report generation failed', detail: msg }, { status: 500 })
  }
}

// ========================================================================
// REVENUE REPORT
// ========================================================================

async function revenueReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  // 1. Daily revenue trend
  const dailyResult = await turso.execute({
    sql: `SELECT date(t."createdAt") AS day,
          COUNT(*) AS txCount,
          COALESCE(SUM(t."total"), 0) AS revenue,
          COALESCE(SUM(t."discount"), 0) AS totalDiscount
          FROM "Transaction" t
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY day ORDER BY day`,
    args: [from, to, ...userArgs],
  })
  const daily = toObjs(dailyResult).map((r) => ({
    day: r.day as string,
    txCount: Number(r.txCount),
    revenue: Number(r.revenue),
    totalDiscount: Number(r.totalDiscount),
  }))

  // 2. Revenue by hour of day (for the period)
  const hourlyResult = await turso.execute({
    sql: `SELECT CAST(strftime('%H', t."createdAt") AS INTEGER) AS hour,
          COUNT(*) AS txCount,
          COALESCE(SUM(t."total"), 0) AS revenue
          FROM "Transaction" t
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY hour ORDER BY hour`,
    args: [from, to, ...userArgs],
  })
  const hourly = toObjs(hourlyResult).map((r) => ({
    hour: Number(r.hour),
    txCount: Number(r.txCount),
    revenue: Number(r.revenue),
  }))

  // 3. Revenue by day of week (across all time for pattern)
  const dowResult = await turso.execute({
    sql: `SELECT CAST(strftime('%w', t."createdAt") AS INTEGER) AS dow,
          COUNT(*) AS txCount,
          COALESCE(SUM(t."total"), 0) AS revenue,
          COALESCE(SUM(t."total") / COUNT(DISTINCT date(t."createdAt")), 0) AS avgRevenue
          FROM "Transaction" t
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY dow ORDER BY dow`,
    args: [from, to, ...userArgs],
  })
  const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayOfWeek = toObjs(dowResult).map((r) => ({
    day: dowLabels[Number(r.dow) as number] || 'Unknown',
    dow: Number(r.dow),
    txCount: Number(r.txCount),
    revenue: Number(r.revenue),
    avgRevenue: Number(r.avgRevenue),
  }))

  // 4. Top revenue products for the period
  const topProductsResult = await turso.execute({
    sql: `SELECT ti."productId", ti."productName",
          SUM(ti."quantity") AS totalQty,
          SUM(ti."subtotal") AS totalRevenue,
          COUNT(DISTINCT ti."transactionId") AS txCount
          FROM "TransactionItem" ti
          JOIN "Transaction" t ON t."id" = ti."transactionId"
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY ti."productId", ti."productName"
          ORDER BY totalRevenue DESC LIMIT 15`,
    args: [from, to, ...userArgs],
  })
  const topProducts = toObjs(topProductsResult).map((r) => ({
    productId: r.productId as string,
    productName: r.productName as string,
    totalQty: Number(r.totalQty),
    totalRevenue: Number(r.totalRevenue),
    txCount: Number(r.txCount),
  }))

  // 5. Summary KPIs
  const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0)
  const totalTx = daily.reduce((s, d) => s + d.txCount, 0)
  const totalDiscount = daily.reduce((s, d) => s + d.totalDiscount, 0)
  const avgTxValue = totalTx > 0 ? totalRevenue / totalTx : 0

  return NextResponse.json({
    summary: { totalRevenue, totalTx, totalDiscount, avgTxValue, dateRange: { from, to } },
    daily, hourly, dayOfWeek, topProducts,
  })
}

// ========================================================================
// PROFIT REPORT
// ========================================================================

async function profitReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  // Product-level profit: sellingPrice (from TXN item) vs costPrice (from Product/Batch)
  const productProfitResult = await turso.execute({
    sql: `SELECT ti."productId", ti."productName",
          SUM(ti."quantity") AS totalQty,
          SUM(ti."subtotal") AS totalRevenue,
          COALESCE(p."costPrice", b."costPrice", 0) AS costPrice,
          SUM(ti."quantity") * COALESCE(p."costPrice", b."costPrice", 0) AS totalCost,
          SUM(ti."subtotal") - SUM(ti."quantity") * COALESCE(p."costPrice", b."costPrice", 0) AS profit,
          p."category"
          FROM "TransactionItem" ti
          JOIN "Transaction" t ON t."id" = ti."transactionId"
          LEFT JOIN "Product" p ON p."id" = ti."productId"
          LEFT JOIN "Batch" b ON b."productId" = ti."productId"
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY ti."productId", ti."productName", p."costPrice", b."costPrice", p."category"
          ORDER BY profit DESC`,
    args: [from, to, ...userArgs],
  })
  const productProfit = toObjs(productProfitResult).map((r) => {
    const rev = Number(r.totalRevenue)
    const cost = Number(r.totalCost)
    const profit = rev - cost
    const margin = rev > 0 ? (profit / rev) * 100 : 0
    return {
      productId: r.productId as string,
      productName: r.productName as string,
      category: (r.category as string) || 'Uncategorized',
      totalQty: Number(r.totalQty),
      totalRevenue: rev,
      totalCost: cost,
      profit,
      margin: Math.round(margin * 100) / 100,
    }
  })

  // Profit by category
  const categoryProfitResult = await turso.execute({
    sql: `SELECT COALESCE(p."category", 'Uncategorized') AS category,
          SUM(ti."subtotal") AS totalRevenue,
          SUM(ti."quantity") * COALESCE(p."costPrice", b."costPrice", 0) AS totalCost,
          SUM(ti."subtotal") - SUM(ti."quantity") * COALESCE(p."costPrice", b."costPrice", 0) AS profit
          FROM "TransactionItem" ti
          JOIN "Transaction" t ON t."id" = ti."transactionId"
          LEFT JOIN "Product" p ON p."id" = ti."productId"
          LEFT JOIN "Batch" b ON b."productId" = ti."productId"
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY category
          ORDER BY profit DESC`,
    args: [from, to, ...userArgs],
  })
  const categoryProfit = toObjs(categoryProfitResult).map((r) => {
    const rev = Number(r.totalRevenue)
    const cost = Number(r.totalCost)
    const profit = rev - cost
    return {
      category: r.category as string,
      totalRevenue: rev,
      totalCost: cost,
      profit,
      margin: rev > 0 ? Math.round((profit / rev) * 10000) / 100 : 0,
    }
  })

  // Daily profit trend
  const dailyProfitResult = await turso.execute({
    sql: `SELECT date(t."createdAt") AS day,
          SUM(ti."subtotal") AS revenue,
          SUM(ti."quantity") * AVG(COALESCE(p."costPrice", b."costPrice", 0)) AS cost,
          SUM(ti."subtotal") - SUM(ti."quantity") * AVG(COALESCE(p."costPrice", b."costPrice", 0)) AS profit
          FROM "TransactionItem" ti
          JOIN "Transaction" t ON t."id" = ti."transactionId"
          LEFT JOIN "Product" p ON p."id" = ti."productId"
          LEFT JOIN "Batch" b ON b."productId" = ti."productId"
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY day ORDER BY day`,
    args: [from, to, ...userArgs],
  })
  const dailyProfit = toObjs(dailyProfitResult).map((r) => ({
    day: r.day as string,
    revenue: Number(r.revenue),
    cost: Number(r.cost),
    profit: Number(r.profit),
  }))

  // Summary KPIs
  const totalRevenue = productProfit.reduce((s, p) => s + p.totalRevenue, 0)
  const totalCost = productProfit.reduce((s, p) => s + p.totalCost, 0)
  const totalProfit = totalRevenue - totalCost
  const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0

  return NextResponse.json({
    summary: { totalRevenue, totalCost, totalProfit, avgMargin, dateRange: { from, to } },
    productProfit, categoryProfit, dailyProfit,
  })
}

// ========================================================================
// CUSTOMER REPORT
// ========================================================================

async function customerReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  // Top customers by spend
  const topCustomersResult = await turso.execute({
    sql: `SELECT t."customerId",
          COALESCE(c."firstName", '') || ' ' || COALESCE(c."lastName", '') AS customerName,
          c."phone" AS customerPhone,
          COUNT(DISTINCT t."id") AS txCount,
          COALESCE(SUM(t."total"), 0) AS totalSpent,
          COALESCE(AVG(t."total"), 0) AS avgBasket,
          SUM(ti."quantity") AS totalItems,
          MIN(date(t."createdAt")) AS firstVisit,
          MAX(date(t."createdAt")) AS lastVisit
          FROM "Transaction" t
          LEFT JOIN "Customer" c ON c."id" = t."customerId"
          LEFT JOIN "TransactionItem" ti ON ti."transactionId" = t."id"
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY t."customerId", customerName, c."phone"
          ORDER BY totalSpent DESC LIMIT 20`,
    args: [from, to, ...userArgs],
  })
  const topCustomers = toObjs(topCustomersResult).map((r) => ({
    customerId: r.customerId as string,
    customerName: (r.customerName as string).trim() || 'Walk-in',
    customerPhone: r.customerPhone as string || null,
    txCount: Number(r.txCount),
    totalSpent: Number(r.totalSpent),
    avgBasket: Number(r.avgBasket),
    totalItems: Number(r.totalItems),
    firstVisit: r.firstVisit as string,
    lastVisit: r.lastVisit as string,
  }))

  // New vs returning customers per day
  const retentionResult = await turso.execute({
    sql: `WITH daily_first AS (
          SELECT "customerId", MIN(date("createdAt")) AS firstDate
          FROM "Transaction"
          WHERE "status" NOT IN ('PENDING', 'VOIDED')
            AND date("createdAt") >= date(?)
            AND date("createdAt") <= date(?)
          GROUP BY "customerId"
        )
        SELECT d.day,
          COUNT(DISTINCT CASE WHEN f."firstDate" = d.day THEN d."customerId" END) AS newCustomers,
          COUNT(DISTINCT CASE WHEN f."firstDate" < d.day THEN d."customerId" END) AS returningCustomers,
          COUNT(DISTINCT d."customerId") AS totalCustomers
        FROM (SELECT date("createdAt") AS day, "customerId", "total"
              FROM "Transaction"
              WHERE "status" NOT IN ('PENDING', 'VOIDED')
                AND date("createdAt") >= date(?)
                AND date("createdAt") <= date(?)
              GROUP BY day, "customerId") d
        LEFT JOIN daily_first f ON f."customerId" = d."customerId"
        GROUP BY d.day ORDER BY d.day`,
    args: [from, to, from, to],
  })
  const dailyRetention = toObjs(retentionResult).map((r) => ({
    day: r.day as string,
    newCustomers: Number(r.newCustomers),
    returningCustomers: Number(r.returningCustomers),
    totalCustomers: Number(r.totalCustomers),
  }))

  // Basket size distribution
  const basketResult = await turso.execute({
    sql: `SELECT CASE
          WHEN t."total" < 10 THEN 'Under $10'
          WHEN t."total" < 25 THEN '$10 - $25'
          WHEN t."total" < 50 THEN '$25 - $50'
          WHEN t."total" < 100 THEN '$50 - $100'
          ELSE '$100+'
          END AS basketRange,
          COUNT(*) AS txCount,
          COALESCE(SUM(t."total"), 0) AS totalRevenue
          FROM "Transaction" t
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY basketRange ORDER BY
          CASE basketRange
            WHEN 'Under $10' THEN 1
            WHEN '$10 - $25' THEN 2
            WHEN '$25 - $50' THEN 3
            WHEN '$50 - $100' THEN 4
            ELSE 5
          END`,
    args: [from, to, ...userArgs],
  })
  const basketDistribution = toObjs(basketResult).map((r) => ({
    range: r.basketRange as string,
    txCount: Number(r.txCount),
    totalRevenue: Number(r.totalRevenue),
  }))

  const totalSpent = topCustomers.reduce((s, c) => s + c.totalSpent, 0)
  const totalTxCust = topCustomers.reduce((s, c) => s + c.txCount, 0)

  return NextResponse.json({
    summary: { totalCustomers: topCustomers.length, totalSpent, avgBasket: totalTxCust > 0 ? totalSpent / totalTxCust : 0, dateRange: { from, to } },
    topCustomers, dailyRetention, basketDistribution,
  })
}

// ========================================================================
// EXPIRY REPORT
// ========================================================================

async function expiryReport() {
  const today = todayStr()

  // Expiring in 30, 60, 90 days
  const buckets = [
    { label: '0-30 days', from: today, to: daysAgo(-30) },
    { label: '31-60 days', from: daysAgo(-31), to: daysAgo(-60) },
    { label: '61-90 days', from: daysAgo(-61), to: daysAgo(-90) },
    { label: '90+ days', from: daysAgo(-91), to: daysAgo(-365 * 2) },
  ]

  const expiryBuckets: Array<{ label: string; items: Array<{ productId: string; productName: string; batchNumber: string; quantity: number; costPrice: number; expiryDate: string; totalValue: number }>; count: number; totalValue: number }> = []

  for (const bucket of buckets) {
    const result = await turso.execute({
      sql: `SELECT p."id" AS "productId", p."name" AS "productName",
            b."batchNumber", b."quantity", b."costPrice", b."expiryDate",
            b."quantity" * b."costPrice" AS totalValue,
            i."quantity" AS invQty
            FROM "Batch" b
            JOIN "Product" p ON p."id" = b."productId"
            LEFT JOIN "Inventory" i ON i."productId" = b."productId"
            WHERE b."expiryDate" IS NOT NULL
              AND b."expiryDate" >= date(?)
              AND b."expiryDate" <= date(?)
              AND b."quantity" > 0
            ORDER BY b."expiryDate" ASC`,
      args: [bucket.from, bucket.to],
    })
    const items = toObjs(result).map((r) => ({
      productId: r.productId as string,
      productName: r.productName as string,
      batchNumber: r.batchNumber as string,
      quantity: Number(r.quantity),
      costPrice: Number(r.costPrice),
      expiryDate: r.expiryDate as string,
      totalValue: Number(r.totalValue),
    }))
    expiryBuckets.push({
      label: bucket.label,
      items,
      count: items.length,
      totalValue: items.reduce((s, i) => s + i.totalValue, 0),
    })
  }

  // Already expired
  const expiredResult = await turso.execute({
    sql: `SELECT p."id" AS "productId", p."name" AS "productName",
          b."batchNumber", b."quantity", b."costPrice", b."expiryDate",
          b."quantity" * b."costPrice" AS totalValue
          FROM "Batch" b
          JOIN "Product" p ON p."id" = b."productId"
          WHERE b."expiryDate" IS NOT NULL
            AND b."expiryDate" < date(?)
            AND b."quantity" > 0
          ORDER BY b."expiryDate" ASC`,
    args: [today],
  })
  const expiredItems = toObjs(expiredResult).map((r) => ({
    productId: r.productId as string,
    productName: r.productName as string,
    batchNumber: r.batchNumber as string,
    quantity: Number(r.quantity),
    costPrice: Number(r.costPrice),
    expiryDate: r.expiryDate as string,
    totalValue: Number(r.totalValue),
  }))

  const totalAtRisk = expiryBuckets.reduce((s, b) => s + b.totalValue, 0)
  const totalExpired = expiredItems.reduce((s, i) => s + i.totalValue, 0)

  return NextResponse.json({
    summary: { totalAtRisk, totalExpired, totalLoss: totalAtRisk + totalExpired, asOf: today },
    buckets: expiryBuckets,
    expired: expiredItems,
  })
}

// ========================================================================
// PAYMENT METHODS REPORT
// ========================================================================

async function paymentReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  // Overall distribution
  const distResult = await turso.execute({
    sql: `SELECT "paymentMethod",
          COUNT(*) AS txCount,
          COALESCE(SUM("total"), 0) AS totalAmount,
          COALESCE(AVG("total"), 0) AS avgAmount
          FROM "Transaction"
          WHERE "status" NOT IN ('PENDING', 'VOIDED')
            AND date("createdAt") >= date(?)
            AND date("createdAt") <= date(?)
            ${userFilter}
          GROUP BY "paymentMethod" ORDER BY totalAmount DESC`,
    args: [from, to, ...userArgs],
  })
  const distribution = toObjs(distResult).map((r) => ({
    method: (r.paymentMethod as string).replace(/_/g, ' '),
    txCount: Number(r.txCount),
    totalAmount: Number(r.totalAmount),
    avgAmount: Number(r.avgAmount),
  }))

  // Daily trend by payment method
  const dailyPayResult = await turso.execute({
    sql: `SELECT date("createdAt") AS day, "paymentMethod",
          COUNT(*) AS txCount,
          COALESCE(SUM("total"), 0) AS totalAmount
          FROM "Transaction"
          WHERE "status" NOT IN ('PENDING', 'VOIDED')
            AND date("createdAt") >= date(?)
            AND date("createdAt") <= date(?)
            ${userFilter}
          GROUP BY day, "paymentMethod" ORDER BY day`,
    args: [from, to, ...userArgs],
  })
  const daily = toObjs(dailyPayResult).map((r) => ({
    day: r.day as string,
    method: (r.paymentMethod as string).replace(/_/g, ' '),
    txCount: Number(r.txCount),
    totalAmount: Number(r.totalAmount),
  }))

  return NextResponse.json({
    summary: { dateRange: { from, to } },
    distribution, daily,
  })
}

// ========================================================================
// PERIOD COMPARISON REPORT
// ========================================================================

async function comparisonReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  const prev = samePeriodLastRange(from, to)

  // Current period stats
  const curResult = await turso.execute({
    sql: `SELECT COUNT(*) AS txCount,
          COALESCE(SUM("total"), 0) AS totalRevenue,
          COALESCE(SUM("discount"), 0) AS totalDiscount,
          COALESCE(AVG("total"), 0) AS avgTxValue
          FROM "Transaction"
          WHERE "status" NOT IN ('PENDING', 'VOIDED')
            AND date("createdAt") >= date(?)
            AND date("createdAt") <= date(?)
            ${userFilter}`,
    args: [from, to, ...userArgs],
  })

  // Previous period stats
  const prevResult = await turso.execute({
    sql: `SELECT COUNT(*) AS txCount,
          COALESCE(SUM("total"), 0) AS totalRevenue,
          COALESCE(SUM("discount"), 0) AS totalDiscount,
          COALESCE(AVG("total"), 0) AS avgTxValue
          FROM "Transaction"
          WHERE "status" NOT IN ('PENDING', 'VOIDED')
            AND date("createdAt") >= date(?)
            AND date("createdAt") <= date(?)
            ${userFilter}`,
    args: [prev.from, prev.to, ...userArgs],
  })

  const cur = toObjs(curResult)[0]
  const prv = toObjs(prevResult)[0]

  const curRevenue = Number(cur?.totalRevenue || 0)
  const prevRevenue = Number(prv?.totalRevenue || 0)
  const curTx = Number(cur?.txCount || 0)
  const prevTx = Number(prv?.txCount || 0)
  const curDiscount = Number(cur?.totalDiscount || 0)
  const prevDiscount = Number(prv?.totalDiscount || 0)
  const curAvg = Number(cur?.avgTxValue || 0)
  const prevAvg = Number(prv?.avgTxValue || 0)

  const pctChange = (cur: number, prev: number) =>
    prev !== 0 ? Math.round(((cur - prev) / prev) * 10000) / 100 : (cur > 0 ? 100 : 0)

  // Daily comparison
  const dailyCompResult = await turso.execute({
    sql: `SELECT date("createdAt") AS day,
          COUNT(*) AS txCount,
          COALESCE(SUM("total"), 0) AS revenue
          FROM "Transaction"
          WHERE "status" NOT IN ('PENDING', 'VOIDED')
            AND date("createdAt") >= date(?)
            AND date("createdAt") <= date(?)
            ${userFilter}
          GROUP BY day ORDER BY day`,
    args: [from, to, ...userArgs],
  })
  const dailyCur = toObjs(dailyCompResult)

  const dailyPrevResult = await turso.execute({
    sql: `SELECT date("createdAt") AS day,
          COUNT(*) AS txCount,
          COALESCE(SUM("total"), 0) AS revenue
          FROM "Transaction"
          WHERE "status" NOT IN ('PENDING', 'VOIDED')
            AND date("createdAt") >= date(?)
            AND date("createdAt") <= date(?)
            ${userFilter}
          GROUP BY day ORDER BY day`,
    args: [prev.from, prev.to, ...userArgs],
  })
  const dailyPrv = toObjs(dailyPrevResult)

  // Align previous period days with current period days (day N of period)
  const curDays = dailyCur.length > 0 ? dailyCur.length : 1
  const dailyComparison = dailyCur.map((r, i) => ({
    day: r.day as string,
    currentRevenue: Number(r.revenue),
    currentTx: Number(r.txCount),
    previousRevenue: dailyPrv[i] ? Number(dailyPrv[i].revenue) : 0,
    previousTx: dailyPrv[i] ? Number(dailyPrv[i].txCount) : 0,
  }))

  return NextResponse.json({
    summary: {
      current: { revenue: curRevenue, txCount: curTx, discount: curDiscount, avgTxValue: curAvg, from, to },
      previous: { revenue: prevRevenue, txCount: prevTx, discount: prevDiscount, avgTxValue: prevAvg, from: prev.from, to: prev.to },
      changes: {
        revenue: pctChange(curRevenue, prevRevenue),
        txCount: pctChange(curTx, prevTx),
        discount: pctChange(curDiscount, prevDiscount),
        avgTxValue: pctChange(curAvg, prevAvg),
      },
    },
    dailyComparison,
  })
}

// ========================================================================
// PRISMA FALLBACK
// ========================================================================

async function prismaFallback(
  type: string, from: string, to: string,
  isSuperAdmin: boolean, requesterId: string,
) {
  const { db } = await import('@/lib/db')
  const where: Record<string, unknown> = {
    status: { notIn: ['PENDING', 'VOIDED'] },
    createdAt: { gte: new Date(from), lte: new Date(to + 'T23:59:59') },
  }
  if (!isSuperAdmin && requesterId) { (where as Record<string, unknown>).userId = requesterId }

  switch (type) {
    case 'revenue': {
      const txns = await db.transaction.findMany({ where, select: { total: true, discount: true, createdAt: true, paymentMethod: true } })
      const totalRevenue = txns.reduce((s, t) => s + Number(t.total), 0)
      const totalTx = txns.length
      const totalDiscount = txns.reduce((s, t) => s + Number(t.discount), 0)
      return NextResponse.json({ summary: { totalRevenue, totalTx, totalDiscount, avgTxValue: totalTx > 0 ? totalRevenue / totalTx : 0, dateRange: { from, to } }, daily: [], hourly: [], dayOfWeek: [], topProducts: [] })
    }
    case 'profit':
      return NextResponse.json({ summary: { totalRevenue: 0, totalCost: 0, totalProfit: 0, avgMargin: 0, dateRange: { from, to } }, productProfit: [], categoryProfit: [], dailyProfit: [] })
    case 'customers':
      return NextResponse.json({ summary: { totalCustomers: 0, totalSpent: 0, avgBasket: 0, dateRange: { from, to } }, topCustomers: [], dailyRetention: [], basketDistribution: [] })
    case 'expiry':
      return NextResponse.json({ summary: { totalAtRisk: 0, totalExpired: 0, totalLoss: 0, asOf: todayStr() }, buckets: [], expired: [] })
    case 'payments':
      return NextResponse.json({ summary: { dateRange: { from, to } }, distribution: [], daily: [] })
    case 'comparison':
      return NextResponse.json({ summary: { current: { revenue: 0, txCount: 0, discount: 0, avgTxValue: 0, from, to }, previous: { revenue: 0, txCount: 0, discount: 0, avgTxValue: 0, from, to }, changes: { revenue: 0, txCount: 0, discount: 0, avgTxValue: 0 } }, dailyComparison: [] })
    default:
      return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
  }
}
