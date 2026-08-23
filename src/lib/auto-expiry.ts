/**
 * src/lib/auto-expiry.ts
 *
 * Shared batch-level auto-expiry logic.
 *
 * Problem: If a product has multiple batches (some expired, some active),
 * the Product.expiryDate gets re-synced to the active batch's expiry.
 * Product-level auto-expiry then never fires because Product.expiryDate is
 * in the future — but Inventory.quantity still includes the expired batch's
 * quantity.
 *
 * Solution: On every relevant GET endpoint, zero out any batches whose
 * expiryDate has passed, recalculate Inventory.quantity from active batches,
 * re-sync Product.expiryDate, and mark products as EXPIRED if all stock is gone.
 *
 * This is the same logic that runs in GET /api/inventory but extracted here
 * so all endpoints (products, dashboard, controlled-substances, notifications,
 * transactions) can share it.
 */

import { turso, sqlRaw } from '@/lib/turso'
import { writeProductHistory } from '@/lib/product-history'

/** Convert libsql flat rows → array of Record<string, any> */
function toObjs(result: { columns: Array<string>; rows: Array<Array<unknown>> }) {
  const names = result.columns.map((c) => c)
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((n, i) => {
      obj[n] = row[i]
    })
    return obj
  })
}

/**
 * Run batch-level auto-expiry.
 *
 * 1. Finds all batches where expiryDate <= today AND quantity > 0
 * 2. Zeros those batches
 * 3. Logs EXPIRED events in ProductHistory
 * 4. Recalculates Inventory.quantity = SUM(Batch.quantity) for affected products
 * 5. Re-syncs Product.expiryDate to nearest active batch
 * 6. Marks product as EXPIRED if all stock is gone
 *
 * Then runs product-level auto-expiry for products without any batches
 * that have a product-level expiryDate in the past.
 */
export async function runAutoExpiry(): Promise<void> {
  // ── STEP 1: Batch-level auto-expiry ──
  const expiredBatches = await turso.execute(
    `SELECT b.id, b."productId", b."batchNumber", b.quantity, b."costPrice",
                p.name as productName, p."sellingPrice"
         FROM "Batch" b
         INNER JOIN "Product" p ON p.id = b."productId"
         WHERE b."expiryDate" IS NOT NULL
           AND date(b."expiryDate") <= date('now')
           AND b.quantity > 0`
  )

  if (expiredBatches.rows.length > 0) {
    const now = new Date().toISOString()
    const affectedProductIds = new Set<string>()

    for (const row of toObjs(expiredBatches)) {
      const batchId = row.id as string
      const productId = row.productId as string
      const prevQty = Number(row.quantity) || 0
      affectedProductIds.add(productId)

      // Zero the expired batch
      await turso.execute(
        sqlRaw('UPDATE "Batch" SET quantity = 0, "updatedAt" = ? WHERE id = ?', [now, batchId])
      )

      // Log in product history
      writeProductHistory({
        productId,
        action: 'EXPIRED',
        changedFields: ['batchQuantity', 'status'],
        previousValues: { batchQuantity: prevQty, batchNumber: row.batchNumber, status: 'ACTIVE' },
        newValues: { batchQuantity: 0, status: 'EXPIRED' },
        userId: 'system-auto-expiry',
      })
    }

    // Recalculate inventory totals & re-sync expiry for affected products
    for (const pid of affectedProductIds) {
      const sumResult = await turso.execute(
        sqlRaw(`SELECT COALESCE(SUM(quantity), 0) as total FROM "Batch" WHERE "productId" = ?`, [pid])
      )
      const totalBatchQty = Number(sumResult.rows[0][0]) || 0

      await turso.execute(
        sqlRaw('UPDATE Inventory SET quantity = ?, "updatedAt" = ? WHERE "productId" = ?', [totalBatchQty, now, pid])
      )

      // Re-sync Product.expiryDate to nearest active batch
      await turso.execute(
        sqlRaw(`UPDATE "Product" SET "expiryDate" = (
                SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
              ), "updatedAt" = ?
              WHERE id = ?`, [pid, now, pid])
      )

      // Mark product as EXPIRED only if ALL stock is gone
      if (totalBatchQty === 0) {
        await turso.execute(
          sqlRaw(`UPDATE "Product" SET status = 'EXPIRED', "expiredAt" = ?, "updatedAt" = ? WHERE id = ? AND status != 'DISCONTINUED'`, [now, now, pid])
        )
      }
    }
  }

  // ── STEP 2: Product-level auto-expiry ──
  // Handles products without batches that have a product-level expiryDate.
  // Also catches edge cases where a product-level expiryDate has passed
  // but the product wasn't caught by batch-level expiry (e.g. no batches at all).
  await turso.execute(sqlRaw(`
    UPDATE Inventory SET quantity = 0, "updatedAt" = datetime('now')
    WHERE "productId" IN (
      SELECT p.id FROM "Product" p
      INNER JOIN Inventory i ON i."productId" = p.id
      WHERE p."expiryDate" IS NOT NULL
        AND date(p."expiryDate") <= date('now')
        AND i.quantity > 0
        AND NOT EXISTS (
          SELECT 1 FROM "Batch" b
          WHERE b."productId" = p.id
            AND b.quantity > 0
            AND (b."expiryDate" IS NULL OR date(b."expiryDate") > date('now'))
        )
    )
  `, []))

  // Mark such products as EXPIRED
  await turso.execute(sqlRaw(`
    UPDATE "Product" SET status = 'EXPIRED', "expiredAt" = datetime('now'), "updatedAt" = datetime('now')
    WHERE "expiryDate" IS NOT NULL
      AND date("expiryDate") <= date('now')
      AND status != 'DISCONTINUED'
      AND id IN (SELECT "productId" FROM Inventory WHERE quantity = 0)
      AND NOT EXISTS (
        SELECT 1 FROM "Batch" b
        WHERE b."productId" = "Product".id
          AND b.quantity > 0
          AND (b."expiryDate" IS NULL OR date(b."expiryDate") > date('now'))
      )
  `, []))
}
