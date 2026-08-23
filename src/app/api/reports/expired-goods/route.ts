import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, sqlRaw } from '@/lib/turso'
import { writeProductHistory } from '@/lib/product-history'

/**
 * GET /api/reports/expired-goods
 *
 * Returns ALL expired goods — both unprocessed (stock > 0) and already
 * processed (stock zeroed). Every expired batch is shown individually
 * with the quantity removed, cost value, expiry date, and date removed.
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
    const salesResult = await turso.execute(sqlRaw(`SELECT ti."productId",
             COALESCE(SUM(ti.quantity), 0) as qtySold,
             COALESCE(SUM(ti.subtotal), 0) as salesRevenue
      FROM "TransactionItem" ti
      INNER JOIN "Transaction" t ON ti."transactionId" = t.id
      WHERE ti."productId" IN (${placeholders})
        AND t.status = 'COMPLETED'
      GROUP BY ti."productId"`, chunk))
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
      // Processed: expired batches where quantity was zeroed (removed from inventory)
      // We query ALL batches with past expiry dates to get a complete record
      const [unprocessedResult, processedResult] = await Promise.all([
        turso.execute(sqlRaw(`SELECT b.id as batchId, b."batchNumber", b."expiryDate",
                   b.quantity as batchQty, b."costPrice" as batchCostPrice,
                   b."updatedAt" as batchUpdatedAt,
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
            ORDER BY b."expiryDate" ASC`, [])),
        // Processed: batches that WERE expired and had their stock zeroed
        // We look at batches where expiryDate is past AND quantity = 0
        // (but only if they originally had stock — updatedAt is recent or product is EXPIRED)
        turso.execute(sqlRaw(`SELECT b.id as batchId, b."batchNumber", b."expiryDate",
                   b.quantity as batchQty, b."costPrice" as batchCostPrice,
                   b."updatedAt" as batchUpdatedAt,
                   p.id, p.name, p.ndc, p.category, p."dosageForm",
                   p."sellingPrice", p."costPrice" as productCostPrice, p.manufacturer,
                   p.status as productStatus, p."expiredAt",
                   COALESCE(i.quantity, 0) as totalStockQty
            FROM "Batch" b
            INNER JOIN "Product" p ON p.id = b."productId"
            LEFT JOIN Inventory i ON i."productId" = p.id
            WHERE b."expiryDate" IS NOT NULL
              AND date(b."expiryDate") <= date('now')
              AND b.quantity = 0
              AND (p.status = 'EXPIRED' OR p."expiredAt" IS NOT NULL)
            ORDER BY b."expiryDate" DESC`, [])),
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
            dateRemoved: null,
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
          const batchCost = Number(row.batchCostPrice) || Number(row.productCostPrice) || 0
          const sellingPrice = Number(row.sellingPrice) || 0
          // For processed items, the batchQty is 0 (already zeroed)
          // We show it as the "removed quantity" context
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
            dateRemoved: row.batchUpdatedAt,
            stockQty: 0,
            totalStockQty: Number(row.totalStockQty) || 0,
            processed: true,
            costValue: 0,
            retailValue: 0,
            lossValue: 0,
            qtySold: 0,
            salesRevenue: 0,
          }
        }),
      ]

      // Fetch sales data for all products
      const productIds = [...new Set(allProducts.map((p) => p.productId))]
      const salesMap = await fetchSalesMap(productIds)

      const enriched = allProducts.map((p) => {
        const sales = salesMap[p.productId] || { qtySold: 0, salesRevenue: 0 }
        return { ...p, qtySold: sales.qtySold, salesRevenue: sales.salesRevenue }
      })

      const unprocessed = enriched.filter((p) => !p.processed)
      const processed = enriched.filter((p) => p.processed)

      // For processed items, we need to know the original quantity that was removed.
      // Fetch from ProductHistory for EXPIRED actions
      const processedBatchIds = processed.map((p) => p.id)
      let removedQtyMap: Record<string, number> = {}
      if (processedBatchIds.length > 0) {
        try {
          const chunkSize = 50
          for (let i = 0; i < processedBatchIds.length; i += chunkSize) {
            const chunk = processedBatchIds.slice(i, i + chunkSize)
            const phPlaceholders = chunk.map(() => '?').join(', ')
            // ProductHistory stores previousValues as JSON with batchQuantity
            // The action is EXPIRED and the productId matches
            const phResult = await turso.execute(sqlRaw(`SELECT ph."productId", ph."previousValues", ph."createdAt"
              FROM "ProductHistory" ph
              WHERE ph."productId" IN (
                SELECT DISTINCT "productId" FROM "Batch" WHERE id IN (${phPlaceholders})
              )
              AND ph.action = 'EXPIRED'
              ORDER BY ph."createdAt" DESC`, chunk))
            for (const row of phResult.rows) {
              const r = row as any
              try {
                const prev = typeof r.previousValues === 'string' ? JSON.parse(r.previousValues) : (r.previousValues || {})
                if (prev.batchQuantity && prev.batchQuantity > 0) {
                  // Store by productId — we'll use it for all processed batches of that product
                  const pid = r.productId as string
                  if (!removedQtyMap[pid] || removedQtyMap[pid] < prev.batchQuantity) {
                    removedQtyMap[pid] = prev.batchQuantity
                  }
                }
              } catch { /* skip malformed JSON */ }
            }
          }
        } catch { /* non-critical — we just won't show removed qty */ }
      }

      // Enrich processed items with the removed quantity from history
      const final = enriched.map((p) => {
        if (p.processed && removedQtyMap[p.productId]) {
          const removedQty = removedQtyMap[p.productId]
          return {
            ...p,
            stockQty: 0,
            removedQty,
            costValue: p.costPrice * removedQty,
            retailValue: p.sellingPrice * removedQty,
            lossValue: (p.sellingPrice - p.costPrice) * removedQty,
          }
        }
        return p
      })

      const finalUnprocessed = final.filter((p) => !p.processed)
      const finalProcessed = final.filter((p) => p.processed)

      // Recalculate summary including processed items' historical values
      const allCostValue = final.reduce((s, p) => s + (p.costValue || 0), 0)
      const allRetailValue = final.reduce((s, p) => s + (p.retailValue || 0), 0)
      const allLossValue = final.reduce((s, p) => s + (p.lossValue || 0), 0)

      return NextResponse.json({
        products: final,
        summary: {
          totalItems: final.length,
          unprocessedItems: finalUnprocessed.length,
          processedItems: finalProcessed.length,
          totalStockQty: finalUnprocessed.reduce((s, p) => s + p.stockQty, 0),
          totalRemovedQty: (finalProcessed as any[]).reduce((s: number, p: any) => s + (p.removedQty || 0), 0),
          totalCostValue: allCostValue,
          totalRetailValue: allRetailValue,
          totalLossValue: allLossValue,
          totalQtySold: final.reduce((s, p) => s + p.qtySold, 0),
          totalSalesRevenue: final.reduce((s, p) => s + p.salesRevenue, 0),
        },
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const expiredProducts = await db.product.findMany({
      where: { expiryDate: { lt: new Date().toISOString() } },
      include: { inventory: true },
      orderBy: { expiryDate: 'desc' },
    })
    const products = expiredProducts.map((p: any) => ({
      id: p.id, name: p.name, ndc: p.ndc, category: p.category,
      dosageForm: p.dosageForm, costPrice: p.costPrice || 0,
      sellingPrice: p.sellingPrice || 0, expiryDate: p.expiryDate,
      batchNumber: p.batchNumber, manufacturer: p.manufacturer,
      productStatus: p.status, expiredAt: null, dateRemoved: null,
      stockQty: p.inventory?.quantity || 0,
      removedQty: 0,
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
        totalRemovedQty: 0,
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
      const result = await turso.execute(sqlRaw(`SELECT b.id, b."productId", b."batchNumber", b.quantity,
                 b."costPrice", p.name, p."sellingPrice"
          FROM "Batch" b
          INNER JOIN "Product" p ON p.id = b."productId"
          WHERE b.id IN (${placeholders})
            AND b."expiryDate" IS NOT NULL
            AND date(b."expiryDate") <= date('now')
            AND b.quantity > 0`, productIds))
      targetBatches = result.rows.map((row: any) => ({
        id: row.id, productId: row.productId, name: row.name,
        batchNumber: row.batchNumber, qty: Number(row.quantity) || 0,
        costPrice: Number(row.costPrice) || 0, sellingPrice: Number(row.sellingPrice) || 0,
      }))
    } else {
      const result = await turso.execute(sqlRaw(`SELECT b.id, b."productId", b."batchNumber", b.quantity,
                 b."costPrice", p.name, p."sellingPrice"
          FROM "Batch" b
          INNER JOIN "Product" p ON p.id = b."productId"
          WHERE b."expiryDate" IS NOT NULL
            AND date(b."expiryDate") <= date('now')
            AND b.quantity > 0`, []))
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
      await turso.execute(sqlRaw('UPDATE "Batch" SET quantity = 0, "updatedAt" = ? WHERE id = ?', [now, batch.id]))
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
      const sumResult = await turso.execute(sqlRaw(`SELECT COALESCE(SUM(quantity), 0) as total FROM "Batch" WHERE "productId" = ?`, [pid]))
      const totalBatchQty = Number(sumResult.rows[0][0]) || 0
      await turso.execute(sqlRaw('UPDATE Inventory SET quantity = ?, "updatedAt" = ? WHERE "productId" = ?', [totalBatchQty, now, pid]))

      // Re-sync Product.expiryDate to nearest ACTIVE (non-expired) batch
      await turso.execute(sqlRaw(`UPDATE "Product" SET "expiryDate" = (
                SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
              ), "updatedAt" = ?
              WHERE id = ?`, [pid, now, pid]))

      // Set expiredAt on product when ALL stock is gone
      if (totalBatchQty === 0) {
        await turso.execute(sqlRaw(`UPDATE "Product" SET status = 'EXPIRED', "expiredAt" = ?, "updatedAt" = ? WHERE id = ? AND status != 'DISCONTINUED'`, [now, now, pid]))
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

// ===================== DELETE — Remove expired records from report =====================

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { batchIds, all } = body as { batchIds?: string[]; all?: boolean }

    if (!isTurso()) {
      return NextResponse.json({ error: 'Requires cloud database' }, { status: 400 })
    }

    const now = new Date().toISOString()
    let deletedCount = 0
    const affectedProductIds = new Set<string>()

    if (all) {
      // Delete ALL expired batch records (both processed and unprocessed)
      // First collect affected product IDs for inventory recalc
      const prodResult = await turso.execute(sqlRaw(`SELECT DISTINCT "productId" FROM "Batch" WHERE "expiryDate" IS NOT NULL AND date("expiryDate") <= date('now')`, []))
      for (const row of prodResult.rows) affectedProductIds.add(row[0] as string)

      const result = await turso.execute(sqlRaw(`DELETE FROM "Batch" WHERE "expiryDate" IS NOT NULL AND date("expiryDate") <= date('now')`, []))
      deletedCount = result.rowsAffected
    } else if (batchIds && batchIds.length > 0) {
      // Collect affected product IDs
      const ph = batchIds.map(() => '?').join(', ')
      const prodResult = await turso.execute(sqlRaw(`SELECT DISTINCT "productId" FROM "Batch" WHERE id IN (${ph})`, batchIds))
      for (const row of prodResult.rows) affectedProductIds.add(row[0] as string)

      // Delete the batch records
      const delResult = await turso.execute(sqlRaw(`DELETE FROM "Batch" WHERE id IN (${ph})`, batchIds))
      deletedCount = delResult.rowsAffected
    } else {
      return NextResponse.json({ error: 'No items specified for deletion' }, { status: 400 })
    }

    // Recalculate inventory for affected products from remaining batches
    for (const pid of affectedProductIds) {
      const sumResult = await turso.execute(sqlRaw(`SELECT COALESCE(SUM(quantity), 0) as total FROM "Batch" WHERE "productId" = ?`, [pid]))
      const totalBatchQty = Number(sumResult.rows[0][0]) || 0
      await turso.execute(sqlRaw('UPDATE Inventory SET quantity = ?, "updatedAt" = ? WHERE "productId" = ?', [totalBatchQty, now, pid]))
      // Re-sync product expiry to nearest active batch
      await turso.execute(sqlRaw(`UPDATE "Product" SET "expiryDate" = (
                SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0
              ), "updatedAt" = ? WHERE id = ?`, [pid, now, pid]))
      // If product was EXPIRED and still has stock, reset status
      if (totalBatchQty > 0) {
        await turso.execute(sqlRaw(`UPDATE "Product" SET status = 'ACTIVE', "expiredAt" = NULL, "updatedAt" = ? WHERE id = ? AND status = 'EXPIRED'`, [now, pid]))
      }
    }

    return NextResponse.json({
      deleted: deletedCount,
      message: `${deletedCount} expired record${deletedCount === 1 ? '' : 's'} removed.`,
    })
  } catch (error) {
    console.error('Error deleting expired records:', error)
    return NextResponse.json({ error: 'Failed to delete expired records' }, { status: 500 })
  }
}
