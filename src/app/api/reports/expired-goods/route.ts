import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'
import { writeProductHistory } from '@/lib/product-history'

/**
 * GET /api/reports/expired-goods
 * Query params:
 *   from — expiry date lower bound (YYYY-MM-DD)
 *   to   — expiry date upper bound (YYYY-MM-DD)
 *
 * Returns expired products with:
 *   - whether they still have stock (not yet processed) or already processed (qty zeroed)
 *   - cost value, retail value, loss value
 *   - total quantity sold before expiry (from completed transactions)
 *   - total sales revenue from those sales
 *
 * POST /api/reports/expired-goods
 * Body: { productIds?: string[] }  (if empty, processes ALL expired goods with stock > 0)
 *
 * Actions:
 *   - Sets inventory quantity to 0 for expired products still in stock
 *   - Logs each as EXPIRED in ProductHistory
 *   - Marks product status as 'EXPIRED'
 *   - Returns summary of what was processed
 */

// ---------- Helper: build WHERE conditions for expired products ----------

function buildExpiredWhere(from: string, to: string) {
  const conditions: string[] = ['p."expiryDate" IS NOT NULL', 'date(p."expiryDate") <= date(\'now\')']
  const args: any[] = []
  if (from) { conditions.push('date(p."expiryDate") >= ?'); args.push(from) }
  if (to) { conditions.push('date(p."expiryDate") <= ?'); args.push(to) }
  return { whereSQL: `WHERE ${conditions.join(' AND ')}`, args }
}

// ---------- Helper: fetch sales data for a list of product IDs ----------

async function fetchSalesMap(productIds: string[]): Promise<Record<string, { qtySold: number; salesRevenue: number }>> {
  const salesMap: Record<string, { qtySold: number; salesRevenue: number }> = {}
  if (productIds.length === 0) return salesMap

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
  return salesMap
}

// ===================== GET =====================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''

    if (isTurso()) {
      const { whereSQL, args } = buildExpiredWhere(from, to)

      // Fetch expired products with inventory
      const [productsResult, summaryResult] = await Promise.all([
        turso.execute({
          sql: `SELECT p.id, p.name, p.ndc, p.category, p."dosageForm",
                   p."costPrice", p."sellingPrice", p."expiryDate",
                   p."batchNumber", p.manufacturer, p.status as productStatus,
                   COALESCE(i.quantity, 0) as stockQty,
                   i."updatedAt" as inventoryUpdatedAt
            FROM "Product" p
            LEFT JOIN Inventory i ON i."productId" = p.id
            ${whereSQL}
            ORDER BY p."expiryDate" DESC`,
          args,
        }),
        turso.execute({
          sql: `SELECT
              COUNT(*) as totalItems,
              SUM(CASE WHEN COALESCE(i.quantity, 0) > 0 THEN 1 ELSE 0 END) as unprocessedItems,
              SUM(CASE WHEN COALESCE(i.quantity, 0) = 0 THEN 1 ELSE 0 END) as processedItems,
              COALESCE(SUM(CASE WHEN COALESCE(i.quantity, 0) > 0 THEN i.quantity ELSE 0 END), 0) as totalStockQty,
              COALESCE(SUM(p."costPrice" * CASE WHEN COALESCE(i.quantity, 0) > 0 THEN i.quantity ELSE 0 END), 0) as totalCostValue,
              COALESCE(SUM(p."sellingPrice" * CASE WHEN COALESCE(i.quantity, 0) > 0 THEN i.quantity ELSE 0 END), 0) as totalRetailValue
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
        productStatus: row.productStatus,
        stockQty: Number(row.stockQty) || 0,
        inventoryUpdatedAt: row.inventoryUpdatedAt,
        processed: Number(row.stockQty) === 0,
      }))

      const summary = summaryResult.rows[0]

      // Fetch sales data
      const productIds = products.map((p) => p.id)
      const salesMap = await fetchSalesMap(productIds)

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

      // Compute totals
      const totalQtySold = enriched.reduce((s, p) => s + p.qtySold, 0)
      const totalSalesRevenue = enriched.reduce((s, p) => s + p.salesRevenue, 0)
      const totalCostOfSold = enriched.reduce((s, p) => s + (p.qtySold > 0 ? p.costPrice * p.qtySold : 0), 0)

      return NextResponse.json({
        products: enriched,
        summary: {
          totalItems: Number(summary.totalItems) || 0,
          unprocessedItems: Number(summary.unprocessedItems) || 0,
          processedItems: Number(summary.processedItems) || 0,
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
    const where: any = { expiryDate: { lt: new Date() } }
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
      productStatus: p.status,
      stockQty: p.inventory?.quantity || 0,
      processed: (p.inventory?.quantity || 0) === 0,
      qtySold: 0, salesRevenue: 0, costValue: (p.costPrice || 0) * (p.inventory?.quantity || 0),
      retailValue: (p.sellingPrice || 0) * (p.inventory?.quantity || 0),
      lossValue: ((p.sellingPrice || 0) - (p.costPrice || 0)) * (p.inventory?.quantity || 0),
    }))

    return NextResponse.json({
      products,
      summary: {
        totalItems: products.length,
        unprocessedItems: products.filter((p: any) => !p.processed).length,
        processedItems: products.filter((p: any) => p.processed).length,
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

// ===================== POST — Process (remove) expired goods from inventory =====================

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || ''
    const body = await request.json().catch(() => ({}))
    const { productIds } = body as { productIds?: string[] }

    if (!isTurso()) {
      return NextResponse.json({ error: 'Expired goods processing requires Turso database' }, { status: 400 })
    }

    const now = new Date().toISOString()

    // Build query to find expired products with stock > 0
    let targetProducts: Array<{ id: string; name: string; previousQty: number; costPrice: number; sellingPrice: number }> = []

    if (productIds && productIds.length > 0) {
      // Process specific products
      const placeholders = productIds.map(() => '?').join(', ')
      const result = await turso.execute({
        sql: `SELECT p.id, p.name, p."costPrice", p."sellingPrice",
                 COALESCE(i.quantity, 0) as qty
          FROM "Product" p
          LEFT JOIN Inventory i ON i."productId" = p.id
          WHERE p.id IN (${placeholders})
            AND p."expiryDate" IS NOT NULL
            AND date(p."expiryDate") <= date('now')
            AND COALESCE(i.quantity, 0) > 0`,
        args: productIds,
      })
      targetProducts = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        previousQty: Number(row.qty) || 0,
        costPrice: Number(row.costPrice) || 0,
        sellingPrice: Number(row.sellingPrice) || 0,
      }))
    } else {
      // Process ALL expired goods with stock > 0
      const result = await turso.execute({
        sql: `SELECT p.id, p.name, p."costPrice", p."sellingPrice",
                 COALESCE(i.quantity, 0) as qty
          FROM "Product" p
          LEFT JOIN Inventory i ON i."productId" = p.id
          WHERE p."expiryDate" IS NOT NULL
            AND date(p."expiryDate") <= date('now')
            AND COALESCE(i.quantity, 0) > 0`,
        args: [],
      })
      targetProducts = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        previousQty: Number(row.qty) || 0,
        costPrice: Number(row.costPrice) || 0,
        sellingPrice: Number(row.sellingPrice) || 0,
      }))
    }

    if (targetProducts.length === 0) {
      return NextResponse.json({
        message: 'No expired goods with stock to process',
        processedCount: 0,
        totalCostWrittenOff: 0,
        totalRetailWrittenOff: 0,
        items: [],
      })
    }

    // Process each: set inventory qty to 0, update product status, log history
    const processedItems: Array<{ id: string; name: string; previousQty: number; costValue: number; retailValue: number }> = []
    let totalCostWrittenOff = 0
    let totalRetailWrittenOff = 0

    for (const item of targetProducts) {
      // Update inventory quantity to 0
      await turso.execute({
        sql: `UPDATE Inventory SET quantity = 0, "updatedAt" = ? WHERE "productId" = ?`,
        args: [now, item.id],
      })

      // Update product status to EXPIRED
      await turso.execute({
        sql: `UPDATE "Product" SET status = 'EXPIRED', "updatedAt" = ? WHERE id = ?`,
        args: [now, item.id],
      })

      // Log in product history
      writeProductHistory({
        productId: item.id,
        action: 'EXPIRED',
        changedFields: ['quantity', 'status'],
        previousValues: { quantity: item.previousQty, status: 'ACTIVE' },
        newValues: { quantity: 0, status: 'EXPIRED' },
        userId,
      })

      const costValue = item.costPrice * item.previousQty
      const retailValue = item.sellingPrice * item.previousQty
      totalCostWrittenOff += costValue
      totalRetailWrittenOff += retailValue

      processedItems.push({
        id: item.id,
        name: item.name,
        previousQty: item.previousQty,
        costValue,
        retailValue,
      })
    }

    console.log(`[Expired Goods] Processed ${processedItems.length} items, wrote off cost: ${totalCostWrittenOff}, retail: ${totalRetailWrittenOff}`)

    return NextResponse.json({
      message: `Processed ${processedItems.length} expired item${processedItems.length === 1 ? '' : 's'} — stock removed, status set to EXPIRED`,
      processedCount: processedItems.length,
      totalCostWrittenOff,
      totalRetailWrittenOff,
      totalLoss: totalRetailWrittenOff - totalCostWrittenOff,
      items: processedItems,
    })
  } catch (error) {
    console.error('Error processing expired goods:', error)
    return NextResponse.json({ error: 'Failed to process expired goods' }, { status: 500 })
  }
}
