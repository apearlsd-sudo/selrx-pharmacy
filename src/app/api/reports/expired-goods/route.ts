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
      // Fetch expired BATCHES with product info
      // This correctly handles products with multiple lots of different expiry dates
      const [batchesResult, summaryResult] = await Promise.all([
        turso.execute({
          sql: `SELECT b.id as batchId, b."batchNumber", b."expiryDate",
                   b.quantity as batchQty, b."costPrice" as batchCostPrice,
                   p.id, p.name, p.ndc, p.category, p."dosageForm",
                   p."sellingPrice", p.manufacturer, p.status as productStatus,
                   COALESCE(i.quantity, 0) as totalStockQty
            FROM "Batch" b
            INNER JOIN "Product" p ON p.id = b."productId"
            LEFT JOIN Inventory i ON i."productId" = p.id
            WHERE b."expiryDate" IS NOT NULL
              AND date(b."expiryDate") <= date('now')
              AND b.quantity > 0
            ORDER BY b."expiryDate" ASC`,
          args: [],
        }),
        turso.execute({
          sql: `SELECT
              COUNT(*) as totalItems,
              SUM(b.quantity) as totalStockQty,
              COALESCE(SUM(b.quantity * COALESCE(b."costPrice", p."costPrice", 0)), 0) as totalCostValue,
              COALESCE(SUM(b.quantity * p."sellingPrice"), 0) as totalRetailValue
            FROM "Batch" b
            INNER JOIN "Product" p ON p.id = b."productId"
            WHERE b."expiryDate" IS NOT NULL
              AND date(b."expiryDate") <= date('now')
              AND b.quantity > 0`,
          args: [],
        }),
      ])

      const products = batchesResult.rows.map((row: any) => {
        const batchQty = Number(row.batchQty) || 0
        const batchCost = Number(row.batchCostPrice) || Number(row.costPrice) || 0
        const sellingPrice = Number(row.sellingPrice) || 0
        return {
          id: row.batchId,
          productId: row.id,
          name: row.name,
          ndc: row.ndc,
          category: row.category,
          dosageForm: row.dosageForm,
          costPrice: batchCost,
          sellingPrice,
          expiryDate: row.expiryDate,
          batchNumber: row.batchNumber,
          manufacturer: row.manufacturer,
          productStatus: row.productStatus,
          stockQty: batchQty,
          totalStockQty: Number(row.totalStockQty) || 0,
          inventoryUpdatedAt: null,
          processed: false,
          costValue: batchCost * batchQty,
          retailValue: sellingPrice * batchQty,
          lossValue: (sellingPrice - batchCost) * batchQty,
          qtySold: 0,
          salesRevenue: 0,
        }
      })

      const summary = summaryResult.rows[0]

      // Fetch sales data for the products
      const productIds = [...new Set(products.map((p) => p.productId))]
      const salesMap = await fetchSalesMap(productIds)

      // Merge sales data
      const enriched = products.map((p) => {
        const sales = salesMap[p.productId] || { qtySold: 0, salesRevenue: 0 }
        return { ...p, qtySold: sales.qtySold, salesRevenue: sales.salesRevenue }
      })

      const totalQtySold = enriched.reduce((s, p) => s + p.qtySold, 0)
      const totalSalesRevenue = enriched.reduce((s, p) => s + p.salesRevenue, 0)
      const totalCostOfSold = enriched.reduce((s, p) => s + (p.qtySold > 0 ? p.costPrice * p.qtySold : 0), 0)

      return NextResponse.json({
        products: enriched,
        summary: {
          totalItems: Number(summary.totalItems) || 0,
          unprocessedItems: Number(summary.totalItems) || 0,
          processedItems: 0,
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

    // Find expired batches with stock > 0
    // productIds can now be batch IDs from the batch-based report
    let targetBatches: Array<{ id: string; productId: string; name: string; batchNumber: string | null; qty: number; costPrice: number; sellingPrice: number }> = []

    if (productIds && productIds.length > 0) {
      // Process specific batches
      const placeholders = productIds.map(() => '?').join(', ')
      const result = await turso.execute({
        sql: `SELECT b.id, b."productId", b."batchNumber", b.quantity,
                 b."costPrice", p.name, p."sellingPrice"
          FROM "Batch" b
          INNER JOIN "Product" p ON p.id = b."productId"
          WHERE b.id IN (${placeholders})
            AND b."expiryDate" IS NOT NULL
            AND date(b."expiryDate") <= date('now')
            AND b.quantity > 0`,
        args: productIds,
      })
      targetBatches = result.rows.map((row: any) => ({
        id: row.id, productId: row.productId, name: row.name,
        batchNumber: row.batchNumber, qty: Number(row.quantity) || 0,
        costPrice: Number(row.costPrice) || 0, sellingPrice: Number(row.sellingPrice) || 0,
      }))
    } else {
      // Process ALL expired batches with stock > 0
      const result = await turso.execute({
        sql: `SELECT b.id, b."productId", b."batchNumber", b.quantity,
                 b."costPrice", p.name, p."sellingPrice"
          FROM "Batch" b
          INNER JOIN "Product" p ON p.id = b."productId"
          WHERE b."expiryDate" IS NOT NULL
            AND date(b."expiryDate") <= date('now')
            AND b.quantity > 0`,
        args: [],
      })
      targetBatches = result.rows.map((row: any) => ({
        id: row.id, productId: row.productId, name: row.name,
        batchNumber: row.batchNumber, qty: Number(row.quantity) || 0,
        costPrice: Number(row.costPrice) || 0, sellingPrice: Number(row.sellingPrice) || 0,
      }))
    }

    if (targetBatches.length === 0) {
      return NextResponse.json({
        message: 'No expired goods with stock to process',
        processedCount: 0,
        totalCostWrittenOff: 0,
        totalRetailWrittenOff: 0,
        items: [],
      })
    }

    // Process each expired batch: zero it out and recalculate inventory
    const processedItems: Array<{ id: string; name: string; batchNumber: string | null; previousQty: number; costValue: number; retailValue: number }> = []
    let totalCostWrittenOff = 0
    let totalRetailWrittenOff = 0
    const affectedProductIds = new Set<string>()

    for (const batch of targetBatches) {
      // Zero out the expired batch
      await turso.execute({
        sql: 'UPDATE "Batch" SET quantity = 0, "updatedAt" = ? WHERE id = ?',
        args: [now, batch.id],
      })

      affectedProductIds.add(batch.productId)

      const costValue = batch.costPrice * batch.qty
      const retailValue = batch.sellingPrice * batch.qty
      totalCostWrittenOff += costValue
      totalRetailWrittenOff += retailValue

      processedItems.push({
        id: batch.id,
        name: batch.name,
        batchNumber: batch.batchNumber,
        previousQty: batch.qty,
        costValue,
        retailValue,
      })

      // Log in product history
      writeProductHistory({
        productId: batch.productId,
        action: 'EXPIRED',
        changedFields: ['batchQuantity', 'status'],
        previousValues: { batchQuantity: batch.qty, batchNumber: batch.batchNumber, status: 'ACTIVE' },
        newValues: { batchQuantity: 0, status: 'EXPIRED' },
        userId,
      })
    }

    // Recalculate Inventory totals for affected products
    for (const pid of affectedProductIds) {
      const sumResult = await turso.execute({
        sql: `SELECT COALESCE(SUM(quantity), 0) as total FROM "Batch" WHERE "productId" = ?`,
        args: [pid],
      })
      const totalBatchQty = Number(sumResult.rows[0][0]) || 0
      await turso.execute({
        sql: 'UPDATE Inventory SET quantity = ?, "updatedAt" = ? WHERE "productId" = ?',
        args: [totalBatchQty, now, pid],
      })

      // Update product expiryDate to nearest remaining batch expiry
      await turso.execute({
        sql: `UPDATE "Product" SET "expiryDate" = (
                SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0
              ), "updatedAt" = ?
              WHERE id = ?`,
        args: [pid, now, pid],
      })

      // Set product to EXPIRED only if ALL batches are empty
      if (totalBatchQty === 0) {
        await turso.execute({
          sql: `UPDATE "Product" SET status = 'EXPIRED', "updatedAt" = ? WHERE id = ? AND status != 'DISCONTINUED'`,
          args: [now, pid],
        })
      }
    }

    console.log(`[Expired Goods] Processed ${processedItems.length} batches, wrote off cost: ${totalCostWrittenOff}, retail: ${totalRetailWrittenOff}`)

    return NextResponse.json({
      message: `Processed ${processedItems.length} expired batch${processedItems.length === 1 ? '' : 's'} — stock removed from batches`,
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
