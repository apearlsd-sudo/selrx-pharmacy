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
        case 'stock-velocity':
          return stockVelocityReport(from, to, userFilter, userArgs)
        case 'returns-analysis':
          return returnsAnalysisReport(from, to, userFilter, userArgs)
        case 'user-performance':
          return userPerformanceReport(from, to, requesterRole, isSuperAdmin)
        case 'prescription-analytics':
          return prescriptionAnalyticsReport(from, to, userFilter, userArgs)
        case 'inventory-valuation':
          return inventoryValuationReport()
        case 'discount-analysis':
          return discountAnalysisReport(from, to, userFilter, userArgs)
        case 'shift-analysis':
          return shiftAnalysisReport(from, to, userFilter, userArgs)
        case 'category-deep-dive':
          return categoryDeepDiveReport(from, to, userFilter, userArgs)
        case 'executive-summary':
          return executiveSummaryReport(from, to, userFilter, userArgs)
        case 'product-affinity':
          return productAffinityReport(from, to, userFilter, userArgs)
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
// STOCK VELOCITY REPORT
// ========================================================================

async function stockVelocityReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  // Calculate days in the period
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const daysInPeriod = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1)

  // Product sales velocity: quantity sold, revenue, transactions
  const velocityResult = await turso.execute({
    sql: `SELECT ti."productId", ti."productName",
          p."category", p."sellingPrice", COALESCE(p."costPrice", 0) AS "costPrice",
          COALESCE(i."quantity", 0) AS currentStock,
          SUM(ti."quantity") AS totalSold,
          COALESCE(SUM(ti."subtotal"), 0) AS totalRevenue,
          COUNT(DISTINCT ti."transactionId") AS txCount,
          MIN(date(t."createdAt")) AS firstSold,
          MAX(date(t."createdAt")) AS lastSold
          FROM "TransactionItem" ti
          JOIN "Transaction" t ON t."id" = ti."transactionId"
          LEFT JOIN "Product" p ON p."id" = ti."productId"
          LEFT JOIN "Inventory" i ON i."productId" = ti."productId"
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY ti."productId", ti."productName", p."category", p."sellingPrice", p."costPrice", i."quantity"
          ORDER BY totalSold DESC`,
    args: [from, to, ...userArgs],
  })

  const products = toObjs(velocityResult).map((r) => {
    const sold = Number(r.totalSold)
    const dailyRate = sold / daysInPeriod
    const currentStock = Number(r.currentStock)
    const daysOfStock = dailyRate > 0 ? Math.floor(currentStock / dailyRate) : (currentStock > 0 ? 999 : 0)
    let velocity: 'Fast' | 'Moderate' | 'Slow' | 'Dead'
    if (sold === 0) velocity = 'Dead'
    else if (dailyRate >= 2) velocity = 'Fast'
    else if (dailyRate >= 0.5) velocity = 'Moderate'
    else velocity = 'Slow'
    return {
      productId: r.productId as string,
      productName: r.productName as string,
      category: (r.category as string) || 'Uncategorized',
      totalSold: sold,
      totalRevenue: Number(r.totalRevenue),
      txCount: Number(r.txCount),
      dailyRate: Math.round(dailyRate * 100) / 100,
      currentStock,
      daysOfStock,
      velocity,
      firstSold: r.firstSold as string,
      lastSold: r.lastSold as string,
      sellingPrice: Number(r.sellingPrice),
      costPrice: Number(r.costPrice),
    }
  })

  // Velocity distribution
  const fastMoving = products.filter((p) => p.velocity === 'Fast').length
  const moderateMoving = products.filter((p) => p.velocity === 'Moderate').length
  const slowMoving = products.filter((p) => p.velocity === 'Slow').length
  const deadStock = products.filter((p) => p.velocity === 'Dead').length

  const velocityDistribution = [
    { velocity: 'Fast (2+/day)', count: fastMoving, color: '#059669' },
    { velocity: 'Moderate (0.5-2/day)', count: moderateMoving, color: '#0891b2' },
    { velocity: 'Slow (<0.5/day)', count: slowMoving, color: '#ca8a04' },
    { velocity: 'Dead Stock', count: deadStock, color: '#dc2626' },
  ]

  // Average days to sell one unit across all products
  const avgDaysToSell = products.length > 0
    ? Math.round(products.reduce((s, p) => s + (p.dailyRate > 0 ? 1 / p.dailyRate : 0), 0) / products.filter((p) => p.dailyRate > 0).length)
    : 0

  return NextResponse.json({
    summary: {
      totalProducts: products.length,
      fastMoving,
      slowMoving,
      deadStock,
      avgDaysToSell,
      dateRange: { from, to },
    },
    products,
    velocityDistribution,
  })
}

// ========================================================================
// RETURNS ANALYSIS REPORT
// ========================================================================

async function returnsAnalysisReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  // Returns by reason
  const reasonResult = await turso.execute({
    sql: `SELECT r."reason",
          COUNT(*) AS returnCount,
          COALESCE(SUM(r."refundAmount"), 0) AS totalRefund,
          COALESCE(AVG(r."refundAmount"), 0) AS avgRefund
          FROM "Return" r
          JOIN "Transaction" t ON t."id" = r."transactionId"
          WHERE date(r."createdAt") >= date(?)
            AND date(r."createdAt") <= date(?)
            ${userFilter}
          GROUP BY r."reason"
          ORDER BY returnCount DESC`,
    args: [from, to, ...userArgs],
  })
  const byReason = toObjs(reasonResult).map((r) => ({
    reason: (r.reason as string).replace(/_/g, ' '),
    returnCount: Number(r.returnCount),
    totalRefund: Number(r.totalRefund),
    avgRefund: Number(r.avgRefund),
  }))

  // Daily return trend
  const dailyResult = await turso.execute({
    sql: `SELECT date(r."createdAt") AS day,
          COUNT(*) AS returnCount,
          COALESCE(SUM(r."refundAmount"), 0) AS totalRefund,
          COUNT(DISTINCT r."transactionId") AS affectedTx
          FROM "Return" r
          JOIN "Transaction" t ON t."id" = r."transactionId"
          WHERE date(r."createdAt") >= date(?)
            AND date(r."createdAt") <= date(?)
            ${userFilter}
          GROUP BY day ORDER BY day`,
    args: [from, to, ...userArgs],
  })
  const dailyTrend = toObjs(dailyResult).map((r) => ({
    day: r.day as string,
    returnCount: Number(r.returnCount),
    totalRefund: Number(r.totalRefund),
    affectedTx: Number(r.affectedTx),
  }))

  // Top returned products
  const topProductsResult = await turso.execute({
    sql: `SELECT r."productId", r."productName",
          COUNT(*) AS returnCount,
          SUM(r."quantity") AS totalQtyReturned,
          COALESCE(SUM(r."refundAmount"), 0) AS totalRefund
          FROM "Return" r
          JOIN "Transaction" t ON t."id" = r."transactionId"
          WHERE date(r."createdAt") >= date(?)
            AND date(r."createdAt") <= date(?)
            ${userFilter}
          GROUP BY r."productId", r."productName"
          ORDER BY returnCount DESC LIMIT 15`,
    args: [from, to, ...userArgs],
  })
  const topProducts = toObjs(topProductsResult).map((r) => ({
    productId: r.productId as string,
    productName: r.productName as string,
    returnCount: Number(r.returnCount),
    totalQtyReturned: Number(r.totalQtyReturned),
    totalRefund: Number(r.totalRefund),
  }))

  // Calculate return rate
  const txCountResult = await turso.execute({
    sql: `SELECT COUNT(*) AS totalTx FROM "Transaction" t
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}`,
    args: [from, to, ...userArgs],
  })
  const totalTx = Number(toObjs(txCountResult)[0]?.totalTx || 0)
  const totalReturns = dailyTrend.reduce((s, d) => s + d.returnCount, 0)
  const totalRefundAmount = dailyTrend.reduce((s, d) => s + d.totalRefund, 0)

  return NextResponse.json({
    summary: {
      totalReturns,
      totalRefundAmount,
      returnRate: totalTx > 0 ? Math.round((totalReturns / totalTx) * 10000) / 100 : 0,
      dateRange: { from, to },
    },
    byReason,
    dailyTrend,
    topProducts,
  })
}

// ========================================================================
// USER PERFORMANCE REPORT
// ========================================================================

async function userPerformanceReport(
  from: string, to: string,
  requesterRole: string, isSuperAdmin: boolean,
) {
  // All users with their transaction stats
  const userResult = await turso.execute({
    sql: `SELECT u."id" AS "userId", u."name" AS "userName", u."email", u."role",
          COUNT(DISTINCT t."id") AS txCount,
          COALESCE(SUM(t."total"), 0) AS totalSales,
          COALESCE(SUM(t."subtotal"), 0) AS totalSubtotal,
          COALESCE(SUM(t."discount"), 0) AS totalDiscount,
          COALESCE(AVG(t."total"), 0) AS avgTransaction,
          COALESCE(SUM(t."tax"), 0) AS totalTax
          FROM "User" u
          LEFT JOIN "Transaction" t ON t."userId" = u."id"
            AND t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
          WHERE u."active" = 1
            ${!isSuperAdmin ? `AND u."role" = ?` : ''}
          GROUP BY u."id", u."name", u."email", u."role"
          ORDER BY totalSales DESC`,
    args: [from, to, ...(!isSuperAdmin ? [requesterRole] : [])],
  })

  const users = toObjs(userResult).map((r) => {
    const sales = Number(r.totalSales)
    const discount = Number(r.totalDiscount)
    return {
      userId: r.userId as string,
      userName: r.userName as string,
      email: r.email as string,
      role: r.role as string,
      txCount: Number(r.txCount),
      totalSales: sales,
      totalSubtotal: Number(r.totalSubtotal),
      totalDiscount: discount,
      avgTransaction: Number(r.avgTransaction),
      totalTax: Number(r.totalTax),
      discountRate: sales > 0 ? Math.round((discount / sales) * 10000) / 100 : 0,
    }
  })

  // Items sold per user
  for (const u of users) {
    const itemsResult = await turso.execute({
      sql: `SELECT COALESCE(SUM(ti."quantity"), 0) AS totalItems
            FROM "TransactionItem" ti
            JOIN "Transaction" t ON t."id" = ti."transactionId"
            WHERE t."userId" = ?
              AND t."status" NOT IN ('PENDING', 'VOIDED')
              AND date(t."createdAt") >= date(?)
              AND date(t."createdAt") <= date(?)`,
      args: [u.userId, from, to],
    })
    u.totalItems = Number(toObjs(itemsResult)[0]?.totalItems || 0)

    // Void rate per user
    const voidResult = await turso.execute({
      sql: `SELECT COUNT(*) AS voidCount FROM "Transaction"
            WHERE "userId" = ? AND "status" = 'VOIDED'
              AND date("createdAt") >= date(?)
              AND date("createdAt") <= date(?)`,
      args: [u.userId, from, to],
    })
    const voidCount = Number(toObjs(voidResult)[0]?.voidCount || 0)
    u.voidCount = voidCount
    u.voidRate = (u.txCount + voidCount) > 0
      ? Math.round((voidCount / (u.txCount + voidCount)) * 10000) / 100
      : 0
  }

  const totalSales = users.reduce((s, u) => s + u.totalSales, 0)
  const activeUsers = users.filter((u) => u.txCount > 0)
  const topPerformer = users[0] || null

  return NextResponse.json({
    summary: {
      totalUsers: users.length,
      activeUsers: activeUsers.length,
      avgSalesPerUser: users.length > 0 ? Math.round(totalSales / users.length * 100) / 100 : 0,
      topPerformer: topPerformer ? { name: topPerformer.userName, sales: topPerformer.totalSales } : null,
      dateRange: { from, to },
    },
    users,
  })
}

// ========================================================================
// PRESCRIPTION ANALYTICS REPORT
// ========================================================================

async function prescriptionAnalyticsReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  // Rx by status
  const statusResult = await turso.execute({
    sql: `SELECT p."status", COUNT(*) AS count
          FROM "Prescription" p
          WHERE date(p."createdAt") >= date(?)
            AND date(p."createdAt") <= date(?)
          GROUP BY p."status" ORDER BY count DESC`,
    args: [from, to],
  })
  const byStatus = toObjs(statusResult).map((r) => ({
    status: (r.status as string).replace(/_/g, ' '),
    count: Number(r.count),
  }))

  // Rx by prescriber
  const prescriberResult = await turso.execute({
    sql: `SELECT p."prescriberName",
          COUNT(*) AS rxCount,
          COUNT(DISTINCT p."customerId") AS uniquePatients,
          MIN(date(p."createdAt")) AS firstRx,
          MAX(date(p."createdAt")) AS lastRx
          FROM "Prescription" p
          WHERE date(p."createdAt") >= date(?)
            AND date(p."createdAt") <= date(?)
            AND p."prescriberName" IS NOT NULL AND p."prescriberName" != ''
          GROUP BY p."prescriberName"
          ORDER BY rxCount DESC LIMIT 20`,
    args: [from, to],
  })
  const byPrescriber = toObjs(prescriberResult).map((r) => ({
    prescriberName: r.prescriberName as string,
    rxCount: Number(r.rxCount),
    uniquePatients: Number(r.uniquePatients),
    firstRx: r.firstRx as string,
    lastRx: r.lastRx as string,
  }))

  // Daily Rx trend
  const dailyResult = await turso.execute({
    sql: `SELECT date(p."createdAt") AS day,
          COUNT(*) AS total,
          SUM(CASE WHEN p."status" = 'DISPENSED' THEN 1 ELSE 0 END) AS dispensed,
          SUM(CASE WHEN p."status" IN ('PENDING', 'IN_PROGRESS') THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN p."status" = 'EXPIRED' THEN 1 ELSE 0 END) AS expired
          FROM "Prescription" p
          WHERE date(p."createdAt") >= date(?)
            AND date(p."createdAt") <= date(?)
          GROUP BY day ORDER BY day`,
    args: [from, to],
  })
  const dailyTrend = toObjs(dailyResult).map((r) => ({
    day: r.day as string,
    total: Number(r.total),
    dispensed: Number(r.dispensed),
    pending: Number(r.pending),
    expired: Number(r.expired),
  }))

  // Average fulfillment time (created → filled for DISPENSED)
  const fulfillResult = await turso.execute({
    sql: `SELECT AVG(
          (julianday(p."filledAt") - julianday(p."createdAt")) * 24
          ) AS avgHours
          FROM "Prescription" p
          WHERE p."status" = 'DISPENSED'
            AND p."filledAt" IS NOT NULL
            AND date(p."createdAt") >= date(?)
            AND date(p."createdAt") <= date(?)`,
    args: [from, to],
  })
  const avgFulfillmentHours = Math.round(Number(toObjs(fulfillResult)[0]?.avgHours || 0) * 100) / 100

  const totalRx = byStatus.reduce((s, b) => s + b.count, 0)
  const filled = byStatus.find((b) => b.status === 'DISPENSED')?.count || 0
  const pending = byStatus.filter((b) => b.status === 'PENDING' || b.status === 'IN PROGRESS').reduce((s, b) => s + b.count, 0)

  return NextResponse.json({
    summary: {
      totalRx,
      filled,
      pending,
      avgFulfillmentHours,
      dateRange: { from, to },
    },
    byStatus,
    byPrescriber,
    dailyTrend,
  })
}

// ========================================================================
// INVENTORY VALUATION REPORT
// ========================================================================

async function inventoryValuationReport() {
  // Overall inventory valuation
  const valResult = await turso.execute({
    sql: `SELECT p."id" AS "productId", p."name" AS "productName",
          p."category", p."sellingPrice", COALESCE(p."costPrice", 0) AS "costPrice",
          COALESCE(i."quantity", 0) AS stockQty,
          COALESCE(i."quantity", 0) * p."sellingPrice" AS retailValue,
          COALESCE(i."quantity", 0) * COALESCE(p."costPrice", 0) AS costValue,
          p."reorderPoint", p."reorderQty"
          FROM "Product" p
          LEFT JOIN "Inventory" i ON i."productId" = p."id"
          WHERE p."status" = 'ACTIVE'
          ORDER BY retailValue DESC`,
    args: [],
  })
  const allProducts = toObjs(valResult).map((r) => ({
    productId: r.productId as string,
    productName: r.productName as string,
    category: (r.category as string) || 'Uncategorized',
    sellingPrice: Number(r.sellingPrice),
    costPrice: Number(r.costPrice),
    stockQty: Number(r.stockQty),
    retailValue: Number(r.retailValue),
    costValue: Number(r.costValue),
    potentialProfit: Number(r.retailValue) - Number(r.costValue),
    reorderPoint: Number(r.reorderPoint),
    reorderQty: Number(r.reorderQty),
    margin: Number(r.retailValue) > 0
      ? Math.round(((Number(r.retailValue) - Number(r.costValue)) / Number(r.retailValue)) * 10000) / 100
      : 0,
  }))

  // Valuation by category
  const catMap = new Map<string, { retailValue: number; costValue: number; count: number; units: number }>()
  for (const p of allProducts) {
    const cat = p.category
    const existing = catMap.get(cat) || { retailValue: 0, costValue: 0, count: 0, units: 0 }
    existing.retailValue += p.retailValue
    existing.costValue += p.costValue
    existing.count += 1
    existing.units += p.stockQty
    catMap.set(cat, existing)
  }
  const byCategory = Array.from(catMap.entries()).map(([category, v]) => ({
    category,
    productCount: v.count,
    totalUnits: v.units,
    retailValue: Math.round(v.retailValue * 100) / 100,
    costValue: Math.round(v.costValue * 100) / 100,
    potentialProfit: Math.round((v.retailValue - v.costValue) * 100) / 100,
    margin: v.retailValue > 0 ? Math.round(((v.retailValue - v.costValue) / v.retailValue) * 10000) / 100 : 0,
  })).sort((a, b) => b.retailValue - a.retailValue)

  // Summary
  const totalProducts = allProducts.length
  const stockedProducts = allProducts.filter((p) => p.stockQty > 0)
  const totalUnits = allProducts.reduce((s, p) => s + p.stockQty, 0)
  const totalCostValue = allProducts.reduce((s, p) => s + p.costValue, 0)
  const totalRetailValue = allProducts.reduce((s, p) => s + p.retailValue, 0)

  // Low-value items: stock below reorder point
  const lowValueItems = allProducts
    .filter((p) => p.stockQty > 0 && p.stockQty <= p.reorderPoint)
    .sort((a, b) => a.stockQty - b.reorderPoint)
    .slice(0, 20)

  return NextResponse.json({
    summary: {
      totalProducts,
      stockedProducts: stockedProducts.length,
      totalUnits,
      totalCostValue: Math.round(totalCostValue * 100) / 100,
      totalRetailValue: Math.round(totalRetailValue * 100) / 100,
      potentialProfit: Math.round((totalRetailValue - totalCostValue) * 100) / 100,
    },
    byCategory,
    lowValueItems,
  })
}

// ========================================================================
// DISCOUNT ANALYSIS REPORT
// ========================================================================

async function discountAnalysisReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  // Overall discount stats
  const statsResult = await turso.execute({
    sql: `SELECT COUNT(*) AS totalTx,
          SUM(CASE WHEN t."discount" > 0 THEN 1 ELSE 0 END) AS txWithDiscount,
          COALESCE(SUM(t."discount"), 0) AS totalDiscount,
          COALESCE(SUM(t."total"), 0) AS totalRevenue,
          COALESCE(AVG(CASE WHEN t."discount" > 0 THEN t."discount" END), 0) AS avgDiscount
          FROM "Transaction" t
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}`,
    args: [from, to, ...userArgs],
  })
  const stats = toObjs(statsResult)[0]
  const totalDiscount = Number(stats?.totalDiscount || 0)
  const totalRevenue = Number(stats?.totalRevenue || 0)
  const totalTx = Number(stats?.totalTx || 0)
  const txWithDiscount = Number(stats?.txWithDiscount || 0)
  const avgDiscountPerTx = txWithDiscount > 0 ? Math.round(totalDiscount / txWithDiscount * 100) / 100 : 0
  const discountRate = totalTx > 0 ? Math.round((txWithDiscount / totalTx) * 10000) / 100 : 0

  // By user
  const byUserResult = await turso.execute({
    sql: `SELECT t."userId", u."name" AS "userName",
          COUNT(*) AS txCount,
          SUM(CASE WHEN t."discount" > 0 THEN 1 ELSE 0 END) AS discountedTx,
          COALESCE(SUM(t."discount"), 0) AS totalDiscount,
          COALESCE(SUM(t."total"), 0) AS totalSales,
          COALESCE(SUM(t."subtotal"), 0) AS totalSubtotal
          FROM "Transaction" t
          LEFT JOIN "User" u ON u."id" = t."userId"
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY t."userId", u."name"
          ORDER BY totalDiscount DESC`,
    args: [from, to, ...userArgs],
  })
  const byUser = toObjs(byUserResult).map((r) => ({
    userId: r.userId as string,
    userName: r.userName as string,
    txCount: Number(r.txCount),
    discountedTx: Number(r.discountedTx),
    totalDiscount: Number(r.totalDiscount),
    totalSales: Number(r.totalSales),
    discountPctOfSales: Number(r.totalSales) > 0 ? Math.round((Number(r.totalDiscount) / Number(r.totalSales)) * 10000) / 100 : 0,
    discountTxRate: Number(r.txCount) > 0 ? Math.round((Number(r.discountedTx) / Number(r.txCount)) * 10000) / 100 : 0,
  }))

  // Daily trend
  const dailyResult = await turso.execute({
    sql: `SELECT date(t."createdAt") AS day,
          COALESCE(SUM(t."discount"), 0) AS totalDiscount,
          COALESCE(SUM(t."total"), 0) AS totalRevenue,
          COUNT(*) AS txCount,
          SUM(CASE WHEN t."discount" > 0 THEN 1 ELSE 0 END) AS discountedTx
          FROM "Transaction" t
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY day ORDER BY day`,
    args: [from, to, ...userArgs],
  })
  const dailyTrend = toObjs(dailyResult).map((r) => ({
    day: r.day as string,
    totalDiscount: Number(r.totalDiscount),
    totalRevenue: Number(r.totalRevenue),
    txCount: Number(r.txCount),
    discountedTx: Number(r.discountedTx),
    discountPct: Number(r.totalRevenue) > 0 ? Math.round((Number(r.totalDiscount) / Number(r.totalRevenue)) * 10000) / 100 : 0,
  }))

  // Discount distribution (buckets)
  const distResult = await turso.execute({
    sql: `SELECT CASE
          WHEN t."discount" = 0 THEN 'No Discount'
          WHEN t."discount" <= 5 THEN '1-5'
          WHEN t."discount" <= 10 THEN '6-10'
          WHEN t."discount" <= 20 THEN '11-20'
          WHEN t."discount" <= 50 THEN '21-50'
          ELSE '50+'
          END AS bucket,
          COUNT(*) AS txCount,
          COALESCE(SUM(t."discount"), 0) AS totalDiscount
          FROM "Transaction" t
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY bucket ORDER BY
          CASE bucket
            WHEN 'No Discount' THEN 1 WHEN '1-5' THEN 2 WHEN '6-10' THEN 3
            WHEN '11-20' THEN 4 WHEN '21-50' THEN 5 ELSE 6
          END`,
    args: [from, to, ...userArgs],
  })
  const discountDistribution = toObjs(distResult).map((r) => ({
    bucket: r.bucket as string,
    txCount: Number(r.txCount),
    totalDiscount: Number(r.totalDiscount),
  }))

  return NextResponse.json({
    summary: { totalDiscount, discountRate, avgDiscountPerTx, txWithDiscount, dateRange: { from, to } },
    byUser, dailyTrend, discountDistribution,
  })
}

// ========================================================================
// SHIFT ANALYSIS REPORT
// ========================================================================

async function shiftAnalysisReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  // Hourly performance for the period
  const hourlyResult = await turso.execute({
    sql: `SELECT CAST(strftime('%H', t."createdAt") AS INTEGER) AS hour,
          COUNT(*) AS txCount,
          COALESCE(SUM(t."total"), 0) AS totalRevenue,
          COALESCE(AVG(t."total"), 0) AS avgTxValue,
          COALESCE(SUM(ti."quantity"), 0) AS totalItems
          FROM "Transaction" t
          LEFT JOIN "TransactionItem" ti ON ti."transactionId" = t."id"
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY hour ORDER BY hour`,
    args: [from, to, ...userArgs],
  })
  const hourlyComparison = toObjs(hourlyResult).map((r) => ({
    hour: Number(r.hour),
    label: `${String(r.hour).padStart(2, '0')}:00`,
    txCount: Number(r.txCount),
    totalRevenue: Number(r.totalRevenue),
    avgTxValue: Number(r.avgTxValue),
    totalItems: Number(r.totalItems),
    // Classify into shifts
    shift: Number(r.hour) < 12 ? 'Morning' : Number(r.hour) < 17 ? 'Afternoon' : 'Evening',
  }))

  // Aggregate by shift
  const shiftMap = new Map<string, { txCount: number; revenue: number; items: number }>()
  for (const h of hourlyComparison) {
    const existing = shiftMap.get(h.shift) || { txCount: 0, revenue: 0, items: 0 }
    existing.txCount += h.txCount
    existing.revenue += h.totalRevenue
    existing.items += h.totalItems
    shiftMap.set(h.shift, existing)
  }
  const shifts = Array.from(shiftMap.entries()).map(([shift, v]) => ({
    shift,
    txCount: v.txCount,
    totalRevenue: Math.round(v.revenue * 100) / 100,
    avgTxValue: v.txCount > 0 ? Math.round(v.revenue / v.txCount * 100) / 100 : 0,
    totalItems: v.items,
  }))

  // Day-of-week by shift
  const dowShiftResult = await turso.execute({
    sql: `SELECT CAST(strftime('%w', t."createdAt") AS INTEGER) AS dow,
          CASE
            WHEN CAST(strftime('%H', t."createdAt") AS INTEGER) < 12 THEN 'Morning'
            WHEN CAST(strftime('%H', t."createdAt") AS INTEGER) < 17 THEN 'Afternoon'
            ELSE 'Evening'
          END AS shift,
          COUNT(*) AS txCount,
          COALESCE(SUM(t."total"), 0) AS totalRevenue
          FROM "Transaction" t
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY dow, shift ORDER BY dow`,
    args: [from, to, ...userArgs],
  })
  const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dowShiftData = toObjs(dowShiftResult).map((r) => ({
    day: dowLabels[Number(r.dow) as number] || 'Unknown',
    shift: r.shift as string,
    txCount: Number(r.txCount),
    totalRevenue: Number(r.totalRevenue),
  }))

  const totalRevenue = shifts.reduce((s, sh) => s + sh.totalRevenue, 0)
  const totalTx = shifts.reduce((s, sh) => s + sh.txCount, 0)

  return NextResponse.json({
    summary: { totalRevenue, totalTx, avgTxValue: totalTx > 0 ? Math.round(totalRevenue / totalTx * 100) / 100 : 0, dateRange: { from, to } },
    shifts, hourlyComparison, dowShiftData,
  })
}

// ========================================================================
// CATEGORY DEEP DIVE REPORT
// ========================================================================

async function categoryDeepDiveReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  // Category-level metrics
  const catResult = await turso.execute({
    sql: `SELECT COALESCE(p."category", 'Uncategorized') AS category,
          COUNT(DISTINCT ti."productId") AS productCount,
          SUM(ti."quantity") AS totalQty,
          COALESCE(SUM(ti."subtotal"), 0) AS totalRevenue,
          COUNT(DISTINCT ti."transactionId") AS txCount,
          COALESCE(AVG(ti."unitPrice"), 0) AS avgUnitPrice
          FROM "TransactionItem" ti
          JOIN "Transaction" t ON t."id" = ti."transactionId"
          LEFT JOIN "Product" p ON p."id" = ti."productId"
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}
          GROUP BY category ORDER BY totalRevenue DESC`,
    args: [from, to, ...userArgs],
  })
  const categories = toObjs(catResult).map((r) => ({
    category: r.category as string,
    productCount: Number(r.productCount),
    totalQty: Number(r.totalQty),
    totalRevenue: Number(r.totalRevenue),
    txCount: Number(r.txCount),
    avgUnitPrice: Number(r.avgUnitPrice),
    revenueShare: 0, // will fill after
  }))

  // Fill revenue share
  const totalRev = categories.reduce((s, c) => s + c.totalRevenue, 0)
  for (const c of categories) { c.revenueShare = totalRev > 0 ? Math.round((c.totalRevenue / totalRev) * 10000) / 100 : 0 }

  // Top 3 products per category (for top 5 categories)
  const topCats = categories.slice(0, 5)
  const topProductsByCategory: Array<{ category: string; products: Array<Record<string, unknown>> }> = []
  for (const cat of topCats) {
    const prodResult = await turso.execute({
      sql: `SELECT ti."productName", SUM(ti."quantity") AS totalQty,
            COALESCE(SUM(ti."subtotal"), 0) AS totalRevenue,
            COUNT(DISTINCT ti."transactionId") AS txCount
            FROM "TransactionItem" ti
            JOIN "Transaction" t ON t."id" = ti."transactionId"
            LEFT JOIN "Product" p ON p."id" = ti."productId"
            WHERE t."status" NOT IN ('PENDING', 'VOIDED')
              AND date(t."createdAt") >= date(?)
              AND date(t."createdAt") <= date(?)
              AND COALESCE(p."category", 'Uncategorized') = ?
            GROUP BY ti."productName" ORDER BY totalRevenue DESC LIMIT 5`,
      args: [from, to, cat.category],
    })
    topProductsByCategory.push({
      category: cat.category,
      products: toObjs(prodResult).map((r) => ({
        productName: r.productName as string,
        totalQty: Number(r.totalQty),
        totalRevenue: Number(r.totalRevenue),
        txCount: Number(r.txCount),
      })),
    })
  }

  return NextResponse.json({
    summary: {
      totalCategories: categories.length,
      topCategory: categories[0] ? { name: categories[0].category, revenue: categories[0].totalRevenue } : null,
      dateRange: { from, to },
    },
    categories,
    topProductsByCategory,
  })
}

// ========================================================================
// EXECUTIVE SUMMARY REPORT
// ========================================================================

async function executiveSummaryReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  const today = todayStr()

  // Core KPIs
  const kpiResult = await turso.execute({
    sql: `SELECT
          COALESCE(SUM(CASE WHEN t."status" NOT IN ('PENDING', 'VOIDED') THEN t."total" ELSE 0 END), 0) AS revenue,
          COUNT(CASE WHEN t."status" NOT IN ('PENDING', 'VOIDED') THEN 1 END) AS completedTx,
          COUNT(CASE WHEN t."status" = 'VOIDED' THEN 1 END) AS voidedTx,
          COALESCE(SUM(CASE WHEN t."status" NOT IN ('PENDING', 'VOIDED') THEN t."discount" ELSE 0 END), 0) AS totalDiscount,
          COALESCE(SUM(CASE WHEN t."status" NOT IN ('PENDING', 'VOIDED') AND date(t."createdAt") = date(?) THEN t."total" ELSE 0 END), 0) AS todayRevenue,
          COUNT(CASE WHEN t."status" NOT IN ('PENDING', 'VOIDED') AND date(t."createdAt") = date(?) THEN 1 END) AS todayTx
          FROM "Transaction" t
          WHERE date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
            ${userFilter}`,
    args: [today, today, from, to, ...userArgs],
  })
  const kpi = toObjs(kpiResult)[0]

  // Returns count and amount
  const retResult = await turso.execute({
    sql: `SELECT COUNT(*) AS totalReturns, COALESCE(SUM(r."refundAmount"), 0) AS totalRefund
          FROM "Return" r
          JOIN "Transaction" t ON t."id" = r."transactionId"
          WHERE date(r."createdAt") >= date(?) AND date(r."createdAt") <= date(?)
          ${userFilter}`,
    args: [from, to, ...userArgs],
  })
  const ret = toObjs(retResult)[0]

  // Low stock alerts
  const lowStockResult = await turso.execute({
    sql: `SELECT COUNT(*) AS lowStockCount FROM "Inventory" i
          JOIN "Product" p ON p."id" = i."productId"
          WHERE i."quantity" <= p."reorderPoint" AND p."status" = 'ACTIVE'`,
    args: [],
  })
  const lowStock = Number(toObjs(lowStockResult)[0]?.lowStockCount || 0)

  // Pending prescriptions
  const pendingRxResult = await turso.execute({
    sql: `SELECT COUNT(*) AS pendingRx FROM "Prescription"
          WHERE "status" IN ('PENDING', 'IN_PROGRESS')`,
    args: [],
  })
  const pendingRx = Number(toObjs(pendingRxResult)[0]?.pendingRx || 0)

  // Pending returns
  const pendingReturnResult = await turso.execute({
    sql: `SELECT COUNT(*) AS pendingReturns FROM "Return" WHERE "status" = 'PENDING_APPROVAL'`,
    args: [],
  })
  const pendingReturns = Number(toObjs(pendingReturnResult)[0]?.pendingReturns || 0)

  const revenue = Number(kpi?.revenue || 0)
  const completedTx = Number(kpi?.completedTx || 0)
  const voidedTx = Number(kpi?.voidedTx || 0)
  const totalDiscount = Number(kpi?.totalDiscount || 0)
  const todayRevenue = Number(kpi?.todayRevenue || 0)
  const todayTx = Number(kpi?.todayTx || 0)
  const totalReturns = Number(ret?.totalReturns || 0)
  const totalRefund = Number(ret?.totalRefund || 0)

  // Build alerts
  const alerts: Array<{ type: 'warning' | 'danger' | 'info'; message: string }> = []
  if (lowStock > 0) alerts.push({ type: 'warning', message: `${lowStock} products are at or below reorder point` })
  if (pendingRx > 0) alerts.push({ type: 'info', message: `${pendingRx} prescriptions awaiting fulfillment` })
  if (pendingReturns > 0) alerts.push({ type: 'warning', message: `${pendingReturns} returns pending approval` })
  if (voidedTx > 0) alerts.push({ type: 'danger', message: `${voidedTx} transactions were voided in this period` })
  if (completedTx > 0 && (voidedTx / completedTx) > 0.03) alerts.push({ type: 'danger', message: `Void rate is ${(voidedTx / completedTx * 100).toFixed(1)}% — above 3% threshold` })

  return NextResponse.json({
    summary: { dateRange: { from, to } },
    kpis: {
      revenue, completedTx, voidedTx, totalDiscount,
      todayRevenue, todayTx,
      totalReturns, totalRefund,
      avgTxValue: completedTx > 0 ? Math.round(revenue / completedTx * 100) / 100 : 0,
      voidRate: completedTx + voidedTx > 0 ? Math.round(voidedTx / (completedTx + voidedTx) * 10000) / 100 : 0,
      lowStockCount: lowStock,
      pendingRx, pendingReturns,
    },
    alerts,
    highlights: [
      { label: 'Revenue', value: revenue, formatted: formatForExec(revenue) },
      { label: 'Transactions', value: completedTx, formatted: String(completedTx) },
      { label: 'Avg Transaction', value: 0, formatted: formatForExec(completedTx > 0 ? revenue / completedTx : 0) },
      { label: 'Total Discounts', value: totalDiscount, formatted: formatForExec(totalDiscount) },
      { label: 'Returns', value: totalReturns, formatted: String(totalReturns) },
      { label: 'Refunds', value: totalRefund, formatted: formatForExec(totalRefund) },
    ],
  })
}

function formatForExec(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(2)
}

// ========================================================================
// PRODUCT AFFINITY (MARKET BASKET) REPORT
// ========================================================================

async function productAffinityReport(
  from: string, to: string,
  userFilter: string, userArgs: unknown[],
) {
  // Find product pairs that appear in the same transaction
  // Uses a self-join approach: for each transaction with 2+ items,
  // find all pairs of products
  const pairsResult = await turso.execute({
    sql: `SELECT
          CASE WHEN ti1."productId" < ti2."productId"
            THEN ti1."productName" || ' + ' || ti2."productName"
            ELSE ti2."productName" || ' + ' || ti1."productName"
          END AS pairName,
          CASE WHEN ti1."productId" < ti2."productId"
            THEN ti1."productName"
            ELSE ti2."productName"
          END AS productA,
          CASE WHEN ti1."productId" < ti2."productId"
            THEN ti2."productName"
            ELSE ti1."productName"
          END AS productB,
          COUNT(DISTINCT ti1."transactionId") AS coOccurrence
          FROM "TransactionItem" ti1
          JOIN "TransactionItem" ti2 ON ti2."transactionId" = ti1."transactionId"
            AND ti2."productId" != ti1."productId"
          JOIN "Transaction" t ON t."id" = ti1."transactionId"
          WHERE t."status" NOT IN ('PENDING', 'VOIDED')
            AND date(t."createdAt") >= date(?)
            AND date(t."createdAt") <= date(?)
          GROUP BY pairName
          ORDER BY coOccurrence DESC
          LIMIT 30`,
    args: [from, to],
  })
  const pairs = toObjs(pairsResult).map((r) => ({
    pairName: r.pairName as string,
    productA: r.productA as string,
    productB: r.productB as string,
    coOccurrence: Number(r.coOccurrence),
  }))

  return NextResponse.json({
    summary: { totalPairs: pairs.length, dateRange: { from, to } },
    pairs,
  })
}

// ========================================================================
// PRISMA FALLBACK
// =========================================================================

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
    case 'stock-velocity':
      return NextResponse.json({ summary: { totalProducts: 0, fastMoving: 0, slowMoving: 0, deadStock: 0, avgDaysToSell: 0, dateRange: { from, to } }, products: [], velocityDistribution: [] })
    case 'returns-analysis':
      return NextResponse.json({ summary: { totalReturns: 0, totalRefundAmount: 0, returnRate: 0, dateRange: { from, to } }, byReason: [], dailyTrend: [], topProducts: [] })
    case 'user-performance':
      return NextResponse.json({ summary: { totalUsers: 0, avgSalesPerUser: 0, topPerformer: null, dateRange: { from, to } }, users: [] })
    case 'prescription-analytics':
      return NextResponse.json({ summary: { totalRx: 0, filled: 0, pending: 0, avgFulfillmentHours: 0, dateRange: { from, to } }, byStatus: [], byPrescriber: [], dailyTrend: [] })
    case 'inventory-valuation':
      return NextResponse.json({ summary: { totalProducts: 0, totalUnits: 0, totalCostValue: 0, totalRetailValue: 0, potentialProfit: 0 }, byCategory: [], lowValueItems: [] })
    case 'discount-analysis':
      return NextResponse.json({ summary: { totalDiscount: 0, discountRate: 0, avgDiscountPerTx: 0, txWithDiscount: 0, dateRange: { from, to } }, byUser: [], dailyTrend: [], discountDistribution: [] })
    case 'shift-analysis':
      return NextResponse.json({ summary: { totalRevenue: 0, totalTx: 0, avgTxValue: 0, dateRange: { from, to } }, shifts: [], hourlyComparison: [] })
    case 'category-deep-dive':
      return NextResponse.json({ summary: { totalCategories: 0, topCategory: null, dateRange: { from, to } }, categories: [], topProductsByCategory: [] })
    case 'executive-summary':
      return NextResponse.json({ summary: { dateRange: { from, to } }, kpis: {}, highlights: [], alerts: [] })
    case 'product-affinity':
      return NextResponse.json({ summary: { totalPairs: 0, dateRange: { from, to } }, pairs: [] })
    default:
      return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
  }
}
