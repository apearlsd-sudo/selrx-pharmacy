import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

/**
 * GET /api/reports/expired-goods
 * Query params:
 *   from — expiry date lower bound (YYYY-MM-DD)
 *   to   — expiry date upper bound (YYYY-MM-DD)
 *
 * Returns expired products with:
 *   - quantity still in stock (waste)
 *   - cost value (costPrice × remaining qty)
 *   - retail value (sellingPrice × remaining qty)
 *   - total quantity sold before expiry (from completed transactions)
 *   - total sales revenue from those sales
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''

    if (isTurso()) {
      const conditions: string[] = ['p."expiryDate" IS NOT NULL', 'p."expiryDate" < date(\'now\')']
      const args: any[] = []

      if (from) {
        conditions.push('p."expiryDate" >= ?')
        args.push(from)
      }
      if (to) {
        conditions.push('p."expiryDate" <= ?')
        args.push(to)
      }

      const whereSQL = `WHERE ${conditions.join(' AND ')}`

      // Fetch expired products with inventory
      const [productsResult, summaryResult] = await Promise.all([
        turso.execute({
          sql: `SELECT p.id, p.name, p.ndc, p.category, p."dosageForm",
                   p."costPrice", p."sellingPrice", p."expiryDate",
                   p."batchNumber", p.manufacturer,
                   i.quantity as stockQty
            FROM "Product" p
            LEFT JOIN Inventory i ON i."productId" = p.id
            ${whereSQL}
            ORDER BY p."expiryDate" DESC`,
          args,
        }),
        turso.execute({
          sql: `SELECT
              COUNT(*) as totalItems,
              COALESCE(SUM(i.quantity), 0) as totalStockQty,
              COALESCE(SUM(p."costPrice" * i.quantity), 0) as totalCostValue,
              COALESCE(SUM(p."sellingPrice" * i.quantity), 0) as totalRetailValue
            FROM "Product" p
            LEFT JOIN Inventory i ON i."productId" = p.id
            ${whereSQL}`,
          args,
        }),
      ])

      const products = productsResult.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        ndc: row.ndc,
        category: row.category,
        dosageForm: row.dosageForm,
        costPrice: Number(row.costPrice) || 0,
        sellingPrice: Number(row.sellingPrice) || 0,
        expiryDate: row.expiryDate,
        batchNumber: row.batchNumber,
        manufacturer: row.manufacturer,
        stockQty: Number(row.stockQty) || 0,
      }))

      const summary = summaryResult.rows[0]

      // For each expired product, fetch sales data (items sold from completed transactions)
      const productIds = products.map((p) => p.id)
      let salesMap: Record<string, { qtySold: number; salesRevenue: number }> = {}

      if (productIds.length > 0) {
        // Batch fetch in chunks of 50 to avoid SQLite limits
        const chunkSize = 50
        for (let i = 0; i < productIds.length; i += chunkSize) {
          const chunk = productIds.slice(i, i + chunkSize)
          const placeholders = chunk.map(() => '?').join(', ')

          const salesResult = await turso.execute({
            sql: `SELECT ti."productId",
                   COALESCE(SUM(ti.quantity), 0) as qtySold,
                   COALESCE(SUM(ti.subtotal), 0) as salesRevenue
            FROM "TransactionItem" ti
            INNER JOIN "Transaction" t ON ti."transactionId" = t.id
            WHERE ti."productId" IN (${placeholders})
              AND t.status = 'COMPLETED'
            GROUP BY ti."productId"`,
            args: chunk,
          })

          for (const row of salesResult.rows) {
            salesMap[(row as any).productId] = {
              qtySold: Number((row as any).qtySold) || 0,
              salesRevenue: Number((row as any).salesRevenue) || 0,
            }
          }
        }
      }

      // Merge sales data into products
      const enriched = products.map((p) => {
        const sales = salesMap[p.id] || { qtySold: 0, salesRevenue: 0 }
        return {
          ...p,
          qtySold: sales.qtySold,
          salesRevenue: sales.salesRevenue,
          costValue: p.costPrice * p.stockQty,
          retailValue: p.sellingPrice * p.stockQty,
          lossValue: (p.sellingPrice - p.costPrice) * p.stockQty,
        }
      })

      // Compute totals including sales
      const totalQtySold = enriched.reduce((s, p) => s + p.qtySold, 0)
      const totalSalesRevenue = enriched.reduce((s, p) => s + p.salesRevenue, 0)
      const totalCostOfSold = enriched.reduce((s, p) => s + (p.qtySold > 0 ? p.costPrice * p.qtySold : 0), 0)

      return NextResponse.json({
        products: enriched,
        summary: {
          totalItems: Number(summary.totalItems) || 0,
          totalStockQty: Number(summary.totalStockQty) || 0,
          totalCostValue: Number(summary.totalCostValue) || 0,
          totalRetailValue: Number(summary.totalRetailValue) || 0,
          totalLossValue: (Number(summary.totalRetailValue) || 0) - (Number(summary.totalCostValue) || 0),
          totalQtySold,
          totalSalesRevenue,
          totalCostOfSold,
          totalProfitFromSold: totalSalesRevenue - totalCostOfSold,
        },
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const where: any = {
      expiryDate: { lt: new Date() },
    }
    if (from) where.expiryDate = { ...where.expiryDate, gte: new Date(from) }
    if (to) where.expiryDate = { ...where.expiryDate, lte: new Date(to + 'T23:59:59') }

    const expiredProducts = await db.product.findMany({
      where,
      include: { inventory: true },
      orderBy: { expiryDate: 'desc' },
    })

    const products = expiredProducts.map((p: any) => ({
      id: p.id, name: p.name, ndc: p.ndc, category: p.category,
      dosageForm: p.dosageForm, costPrice: p.costPrice || 0,
      sellingPrice: p.sellingPrice || 0, expiryDate: p.expiryDate,
      batchNumber: p.batchNumber, manufacturer: p.manufacturer,
      stockQty: p.inventory?.quantity || 0,
      qtySold: 0, salesRevenue: 0, costValue: (p.costPrice || 0) * (p.inventory?.quantity || 0),
      retailValue: (p.sellingPrice || 0) * (p.inventory?.quantity || 0),
      lossValue: ((p.sellingPrice || 0) - (p.costPrice || 0)) * (p.inventory?.quantity || 0),
    }))

    return NextResponse.json({
      products,
      summary: {
        totalItems: products.length,
        totalStockQty: products.reduce((s: number, p: any) => s + p.stockQty, 0),
        totalCostValue: products.reduce((s: number, p: any) => s + p.costValue, 0),
        totalRetailValue: products.reduce((s: number, p: any) => s + p.retailValue, 0),
        totalLossValue: products.reduce((s: number, p: any) => s + p.lossValue, 0),
        totalQtySold: 0, totalSalesRevenue: 0, totalCostOfSold: 0, totalProfitFromSold: 0,
      },
    })
  } catch (error) {
    console.error('Error fetching expired goods report:', error)
    return NextResponse.json({ error: 'Failed to fetch expired goods report' }, { status: 500 })
  }
}
