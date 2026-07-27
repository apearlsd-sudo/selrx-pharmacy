import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/product-sales-analytics — aggregated sales per product
// Supports ?userId=... & ?startDate=... & ?endDate=... & ?categoryId=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const categoryId = searchParams.get('categoryId') || undefined

    // Build where clause for transactions
    const txWhere: any = { status: 'COMPLETED' }
    if (userId) txWhere.userId = userId
    if (startDate) txWhere.createdAt = { ...txWhere.createdAt, gte: new Date(startDate) }
    if (endDate) txWhere.createdAt = { ...txWhere.createdAt, lte: new Date(endDate) }

    // Get all transaction items matching filters
    const transactionItems = await db.transactionItem.findMany({
      where: {
        transaction: txWhere,
        ...(categoryId ? { product: { category: categoryId } } : {}),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            ndc: true,
            category: true,
            strength: true,
            dosageForm: true,
            unitOfMeasure: true,
          },
        },
        transaction: {
          select: {
            userId: true,
            user: { select: { name: true, email: true, role: true } },
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Aggregate by product
    const productMap = new Map<string, {
      productId: string
      productName: string
      productNdc: string | null
      productCategory: string
      productStrength: string | null
      productDosageForm: string | null
      productUnit: string
      totalQuantity: number
      totalRevenue: number
      transactions: number
      lastSold: string | null
    }>()

    for (const item of transactionItems) {
      const key = item.productId
      const existing = productMap.get(key)
      const txDate = item.transaction.createdAt?.toISOString() || null

      if (existing) {
        existing.totalQuantity += item.quantity
        existing.totalRevenue += item.subtotal
        existing.transactions += 1
        if (txDate && (!existing.lastSold || txDate > existing.lastSold)) {
          existing.lastSold = txDate
        }
      } else {
        productMap.set(key, {
          productId: item.productId,
          productName: item.productName,
          productNdc: item.product.ndc,
          productCategory: item.product.category,
          productStrength: item.product.strength,
          productDosageForm: item.product.dosageForm,
          productUnit: item.product.unitOfMeasure,
          totalQuantity: item.quantity,
          totalRevenue: item.subtotal,
          transactions: 1,
          lastSold: txDate,
        })
      }
    }

    // Sort by totalQuantity descending
    const result = Array.from(productMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching product sales analytics:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
