import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

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

// ---------------------------------------------------------------------------
// GET /api/product-sales-analytics — aggregated sales per product
// Supports ?userId=... & ?startDate=... & ?endDate=... & ?categoryId=...
// RBAC: SUPER_ADMIN sees all users; other roles see only their own data
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const categoryId = searchParams.get('categoryId') || undefined

    // RBAC: extract requester role and userId from headers
    const requesterRole = req.headers.get('x-user-role') || ''
    const requesterId = req.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    // Non-SUPER_ADMIN users can only see their own product sales
    const effectiveUserId = isSuperAdmin ? userId : (requesterId || userId)

    // ========================================================================
    // Turso (raw SQL) path
    // ========================================================================
    if (isTurso()) {
      // ---- Build WHERE clause for Transaction ----
      const conditions: string[] = [`t."status" = 'COMPLETED'`]
      const args: unknown[] = []

      if (effectiveUserId) {
        conditions.push(`t."userId" = ?`)
        args.push(effectiveUserId)
      }
      if (startDate) {
        conditions.push(`t."createdAt" >= ?`)
        args.push(new Date(startDate).toISOString())
      }
      if (endDate) {
        conditions.push(`t."createdAt" <= ?`)
        args.push(new Date(endDate).toISOString())
      }

      const txWhere = conditions.join(' AND ')

      // Category filter applied via sub-select on Product
      const categoryClause = categoryId
        ? `AND ti."productId" IN (SELECT "id" FROM Product WHERE "category" = ?)`
        : ''
      if (categoryId) args.push(categoryId)

      // ---- Single combined aggregation (replaces 3 Prisma groupBy calls) ----
      const [aggResult, lastSoldResult] = await Promise.all([
        // qtyAgg + revAgg + txCountAgg combined into one pass
        turso.execute({
          sql: `SELECT ti."productId",
                       ti."productName",
                       COALESCE(SUM(ti."quantity"), 0) as totalQuantity,
                       COALESCE(SUM(ti."subtotal"), 0) as totalRevenue,
                       COUNT(*)                        as transactions
                FROM TransactionItem ti
                JOIN Transaction t ON ti."transactionId" = t."id"
                WHERE ${txWhere} ${categoryClause}
                GROUP BY ti."productId", ti."productName"
                ORDER BY totalQuantity DESC`,
          args: [...args],
        }),

        // Last sold date per product
        turso.execute({
          sql: `SELECT ti."productId",
                       MAX(ti."createdAt") as lastSold
                FROM TransactionItem ti
                JOIN Transaction t ON ti."transactionId" = t."id"
                WHERE ${txWhere} ${categoryClause}
                GROUP BY ti."productId"`,
          args: [...args],
        }),
      ])

      const aggRows = toObjs(aggResult)
      const lastSoldRows = toObjs(lastSoldResult)

      if (aggRows.length === 0) {
        return NextResponse.json([])
      }

      // ---- Fetch product details for all product IDs ----
      const productIds = aggRows.map((r) => r.productId as string)
      const placeholders = productIds.map(() => '?').join(', ')

      const productsResult = await turso.execute({
        sql: `SELECT "id", "name", "ndc", "category",
                     "strength", "dosageForm", "unitOfMeasure"
              FROM Product
              WHERE "id" IN (${placeholders})`,
        args: productIds,
      })

      const productMap = new Map(
        toObjs(productsResult).map((r) => [r.id as string, r]),
      )

      const lastSoldMap = new Map(
        lastSoldRows.map((r) => [
          r.productId as string,
          (r.lastSold as string) || null,
        ]),
      )

      // ---- Build final result ----
      const result = aggRows.map((r) => {
        const product = productMap.get(r.productId as string)
        return {
          productId: r.productId,
          productName: r.productName,
          productNdc: (product?.ndc as string) || null,
          productCategory: (product?.category as string) || '',
          productStrength: (product?.strength as string) || null,
          productDosageForm: (product?.dosageForm as string) || null,
          productUnit: (product?.unitOfMeasure as string) || '',
          totalQuantity: Number(r.totalQuantity || 0),
          totalRevenue: Number(r.totalRevenue || 0),
          transactions: (r.transactions as number) || 0,
          lastSold: lastSoldMap.get(r.productId as string) || null,
        }
      })

      return NextResponse.json(result)
    }

    // ========================================================================
    // Prisma fallback
    // ========================================================================
    const { db } = await import('@/lib/db')

    // Build where clause for transactions
    const txWhere: any = { status: 'COMPLETED' }
    if (effectiveUserId) txWhere.userId = effectiveUserId
    if (startDate) txWhere.createdAt = { ...txWhere.createdAt, gte: new Date(startDate) }
    if (endDate) txWhere.createdAt = { ...txWhere.createdAt, lte: new Date(endDate) }

    // Build where clause for transaction items
    const itemWhere: any = { transaction: txWhere }
    if (categoryId) itemWhere.product = { category: categoryId }

    // Use Prisma groupBy for efficient server-side aggregation
    const [qtyAgg, revAgg, txCountAgg] = await Promise.all([
      // Sum of quantity grouped by product
      db.transactionItem.groupBy({
        by: ['productId', 'productName'],
        where: itemWhere,
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
      }),
      // Sum of revenue grouped by product
      db.transactionItem.groupBy({
        by: ['productId', 'productName'],
        where: itemWhere,
        _sum: { subtotal: true },
      }),
      // Count of transaction items grouped by product
      db.transactionItem.groupBy({
        by: ['productId', 'productName'],
        where: itemWhere,
        _count: true,
      }),
    ])

    // Build lookup maps
    const qtyMap = new Map(qtyAgg.map((r) => [r.productId, r._sum.quantity || 0]))
    const revMap = new Map(revAgg.map((r) => [r.productId, r._sum.subtotal || 0]))
    const txMap = new Map(txCountAgg.map((r) => [r.productId, r._count]))

    // Collect all product IDs to fetch product details in one query
    const productIds = Array.from(new Set([
      ...qtyAgg.map((r) => r.productId),
      ...revAgg.map((r) => r.productId),
      ...txCountAgg.map((r) => r.productId),
    ]))

    if (productIds.length === 0) {
      return NextResponse.json([])
    }

    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        ndc: true,
        category: true,
        strength: true,
        dosageForm: true,
        unitOfMeasure: true,
      },
    })

    const productDetailMap = new Map(products.map((p) => [p.id, p]))

    // Get last sold date per product (lightweight query — only fetch id + createdAt)
    const lastSoldItems = await db.transactionItem.findMany({
      where: itemWhere,
      distinct: ['productId'],
      select: { productId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    const lastSoldMap = new Map(lastSoldItems.map((r) => [r.productId, r.createdAt?.toISOString() || null]))

    // Build final result
    const result = qtyAgg.map((r) => {
      const product = productDetailMap.get(r.productId)
      return {
        productId: r.productId,
        productName: r.productName,
        productNdc: product?.ndc || null,
        productCategory: product?.category || '',
        productStrength: product?.strength || null,
        productDosageForm: product?.dosageForm || null,
        productUnit: product?.unitOfMeasure || '',
        totalQuantity: Number(qtyMap.get(r.productId) || 0),
        totalRevenue: Number(revMap.get(r.productId) || 0),
        transactions: txMap.get(r.productId) || 0,
        lastSold: lastSoldMap.get(r.productId) || null,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching product sales analytics:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch analytics', detail: msg }, { status: 500 })
  }
}
