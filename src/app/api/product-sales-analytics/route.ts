import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/product-sales-analytics — aggregated sales per product
// Supports ?userId=... & ?startDate=... & ?endDate=... & ?categoryId=...
// RBAC: SUPER_ADMIN sees all users; other roles see only their own data
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
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
