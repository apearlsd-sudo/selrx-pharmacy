import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'
import { writeProductHistory } from '@/lib/product-history'

/**
 * GET /api/reports/expired-goods
 *
 * Returns ALL expired goods — both unprocessed (stock > 0) and already
 * processed (stock zeroed, kept for record until user deletes them).
 *
 * POST /api/reports/expired-goods
 * Body: { productIds?: string[] }
 * Zeroes inventory for expired goods & sets expiredAt on Product.
 *
 * DELETE /api/reports/expired-goods
 * Body: { batchIds?: string[], all?: boolean }
 * Permanently discontinues expired products (individual or bulk).
 */

// ---------- Helper ----------

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

export async function GET() {
  try {
    if (isTurso()) {
      // Unprocessed: expired batches still with stock > 0
      const [unprocessedResult, processedResult] = await Promise.all([
        turso.execute({
          sql: `SELECT b.id as batchId, b."batchNumber", b."expiryDate",
                   b.quantity as batchQty, b."costPrice" as batchCostPrice,
                   p.id, p.name, p.ndc, p.category, p."dosageForm",
                   p."sellingPrice", p."costPrice" as productCostPrice, p.manufacturer,
                   p.status as productStatus, p."expiredAt",
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
        // Processed: products marked EXPIRED (stock already zeroed)
        turso.execute({
          sql: `SELECT p.id, p.name, p.ndc, p.category, p."dosageForm",
                   p."sellingPrice", p."costPrice", p.manufacturer,
                   p.status as productStatus, p."expiredAt",
                   p."batchNumber", p."expiryDate",
                   0 as batchQty, 0 as totalStockQty,
                   NULL as batchId, NULL as batchCostPrice
            FROM "Product" p
            WHERE p.status = 'EXPIRED'
              AND p."expiryDate" IS NOT NULL
            ORDER BY p."expiredAt" DESC`,
          args: [],
        }),
      ])

      const allProducts = [
        ...unprocessedResult.rows.map((row: any) => {
          const batchQty = Number(row.batchQty) || 0
          const batchCost = Number(row.batchCostPrice) || Number(row.productCostPrice) || 0
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
            expiredAt: row.expiredAt,
            stockQty: batchQty,
            totalStockQty: Number(row.totalStockQty) || 0,
            processed: false,
            costValue: batchCost * batchQty,
            retailValue: sellingPrice * batchQty,
            lossValue: (sellingPrice - batchCost) * batchQty,
            qtySold: 0,
            salesRevenue: 0,
          }
        }),
        ...processedResult.rows.map((row: any) => {
          const costPrice = Number(row.costPrice) || 0
          const sellingPrice = Number(row.sellingPrice) || 0
          return {
            id: row.id,  // product ID for processed items
            productId: row.id,
            name: row.name,
            ndc: row.ndc,
            category: row.category,
            dosageForm: row.dosageForm,
            costPrice,
            sellingPrice,
            expiryDate: row.expiryDate,
            batchNumber: row.batchNumber,
            manufacturer: row.manufacturer,
            productStatus: row.productStatus,
            expiredAt: row.expiredAt,
            stockQty: 0,
            totalStockQty: 0,
            processed: true,
            costValue: 0,
            retailValue: 0,
            lossValue: 0,
            qtySold: 0,
            salesRevenue: 0,
          }
        }),
      ]

      // Fetch sales data
      const productIds = [...new Set(allProducts.map((p) => p.productId))]
      const salesMap = await fetchSalesMap(productIds)

      const enriched = allProducts.map((p) => {
        const sales = salesMap[p.productId] || { qtySold: 0, salesRevenue: 0 }
        return { ...p, qtySold: sales.qtySold, salesRevenue: sales.salesRevenue }
      })

      const unprocessed = enriched.filter((p) => !p.processed)
      const processed = enriched.filter((p) => p.processed)

      return NextResponse.json({
        products: enriched,
        summary: {
          totalItems: enriched.length,
          unprocessedItems: unprocessed.length,
          processedItems: processed.length,
          totalStockQty: unprocessed.reduce((s, p) => s + p.stockQty, 0),
          totalCostValue: unprocessed.reduce((s, p) => s + p.costValue, 0),
          totalRetailValue: unprocessed.reduce((s, p) => s + p.retailValue, 0),
          totalLossValue: unprocessed.reduce((s, p) => s + p.lossValue, 0),
          totalQtySold: enriched.reduce((s, p) => s + p.qtySold, 0),
          totalSalesRevenue: enriched.reduce((s, p) => s + p.salesRevenue, 0),
        },
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const expiredProducts = await db.product.findMany({
      where: { expiryDate: { lt: new Date() } },
      include: { inventory: true },
      orderBy: { expiryDate: 'desc' },
    })
    const products = expiredProducts.map((p: any) => ({
      id: p.id, name: p.name, ndc: p.ndc, category: p.category,
      dosageForm: p.dosageForm, costPrice: p.costPrice || 0,
      sellingPrice: p.sellingPrice || 0, expiryDate: p.expiryDate,
      batchNumber: p.batchNumber, manufacturer: p.manufacturer,
      productStatus: p.status, expiredAt: null,
      stockQty: p.inventory?.quantity || 0,
      processed: (p.inventory?.quantity || 0) === 0,
      qtySold: 0, salesRevenue: 0,
      costValue: (p.costPrice || 0) * (p.inventory?.quantity || 0),
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
        totalQtySold: 0, totalSalesRevenue: 0,
      },
    })
  } catch (error) {
    console.error('Error fetching expired goods report:', error)
    return NextResponse.json({ error: 'Failed to fetch expired goods report' }, { status: 500 })
  }
}

// ===================== POST — Process expired goods =====================

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || ''
    const body = await request.json().catch(() => ({}))
    const { productIds } = body as { productIds?: string[] }

    if (!isTurso()) {
      return NextResponse.json({ error: 'Requires cloud database' }, { status: 400 })
    }

    const now = new Date().toISOString()

    let targetBatches: Array<{ id: string; productId: string; name: string; batchNumber: string | null; qty: number; costPrice: number; sellingPrice: number }> = []

    if (productIds && productIds.length > 0) {
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
        processedCount: 0, totalCostWrittenOff: 0, totalRetailWrittenOff: 0, items: [],
      })
    }

    const processedItems: Array<{ id: string; name: string; batchNumber: string | null; previousQty: number; costValue: number; retailValue: number }> = []
    let totalCostWrittenOff = 0
    let totalRetailWrittenOff = 0
    const affectedProductIds = new Set<string>()

    for (const batch of targetBatches) {
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
        id: batch.id, name: batch.name, batchNumber: batch.batchNumber,
        previousQty: batch.qty, costValue, retailValue,
      })

      writeProductHistory({
        productId: batch.productId, action: 'EXPIRED',
        changedFields: ['batchQuantity', 'status'],
        previousValues: { batchQuantity: batch.qty, batchNumber: batch.batchNumber, status: 'ACTIVE' },
        newValues: { batchQuantity: 0, status: 'EXPIRED' },
        userId,
      })
    }

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

      // Set expiredAt on product when we expire it
      if (totalBatchQty === 0) {
        await turso.execute({
          sql: `UPDATE "Product" SET status = 'EXPIRED', "expiredAt" = ?, "updatedAt" = ? WHERE id = ? AND status != 'DISCONTINUED'`,
          args: [now, now, pid],
        })
      }
    }

    return NextResponse.json({
      message: `Processed ${processedItems.length} expired batch${processedItems.length === 1 ? '' : 's'}`,
      processedCount: processedItems.length,
      totalCostWrittenOff, totalRetailWrittenOff,
      totalLoss: totalRetailWrittenOff - totalCostWrittenOff,
      items: processedItems,
    })
  } catch (error) {
    console.error('Error processing expired goods:', error)
    return NextResponse.json({ error: 'Failed to process expired goods' }, { status: 500 })
  }
}

// ===================== DELETE — Discontinue expired products =====================

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { batchIds, productIds, all } = body as { batchIds?: string[]; productIds?: string[]; all?: boolean }

    if (!isTurso()) {
      return NextResponse.json({ error: 'Requires cloud database' }, { status: 400 })
    }

    const now = new Date().toISOString()

    if (all) {
      // Discontinue ALL expired products
      const result = await turso.execute({
        sql: `UPDATE "Product" SET status = 'DISCONTINUED', "updatedAt" = ? WHERE status = 'EXPIRED'`,
        args: [now],
      })
      return NextResponse.json({
        discontinued: result.rowsAffected,
        message: `${result.rowsAffected} expired product(s) permanently discontinued.`,
      })
    }

    // Discontinue specific items by product ID or batch ID
    let idsToDiscontinue: string[] = []

    if (productIds && productIds.length > 0) {
      idsToDiscontinue = productIds
    } else if (batchIds && batchIds.length > 0) {
      // Convert batch IDs to product IDs
      const placeholders = batchIds.map(() => '?').join(', ')
      const result = await turso.execute({
        sql: `SELECT DISTINCT "productId" FROM "Batch" WHERE id IN (${placeholders})`,
        args: batchIds,
      })
      idsToDiscontinue = result.rows.map((r) => r[0] as string)
    }

    if (idsToDiscontinue.length === 0) {
      return NextResponse.json({ error: 'No items specified for deletion' }, { status: 400 })
    }

    const placeholders = idsToDiscontinue.map(() => '?').join(', ')
    await turso.execute({
      sql: `UPDATE "Product" SET status = 'DISCONTINUED', "updatedAt" = ? WHERE id IN (${placeholders})`,
      args: [now, ...idsToDiscontinue],
    })

    return NextResponse.json({
      discontinued: idsToDiscontinue.length,
      message: `${idsToDiscontinue.length} expired product(s) discontinued.`,
    })
  } catch (error) {
    console.error('Error deleting expired products:', error)
    return NextResponse.json({ error: 'Failed to delete expired products' }, { status: 500 })
  }
}
