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
 */

import { turso, sqlRaw, toObjs } from '@/lib/turso'
import { writeProductHistory } from '@/lib/product-history'

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
  // ── STEP 0: Reconciliation ──
  // Fix any Inventory rows where quantity is out of sync with the actual
  // SUM(Batch.quantity).  This catches stale data from previous runs where
  // batches were zeroed but Inventory was never updated (e.g. due to an
  // earlier bug).  Only touches products that have at least one expired
  // batch, so the impact is minimal.
  await turso.execute(sqlRaw(`
    UPDATE Inventory SET quantity = (
        SELECT COALESCE(SUM(b.quantity), 0)
        FROM "Batch" b
        WHERE b."productId" = Inventory."productId"
      ), "updatedAt" = datetime('now')
    WHERE "productId" IN (
        SELECT DISTINCT b."productId" FROM "Batch" b
        WHERE b."expiryDate" IS NOT NULL AND date(b."expiryDate") <= date('now')
    )
    AND quantity != (
        SELECT COALESCE(SUM(b.quantity), 0)
        FROM "Batch" b
        WHERE b."productId" = Inventory."productId"
    )
  `, []))

  // Also mark products as EXPIRED if reconciliation just zeroed their stock
  await turso.execute(sqlRaw(`
    UPDATE "Product" SET status = 'EXPIRED', "expiredAt" = datetime('now'), "updatedAt" = datetime('now')
    WHERE status NOT IN ('DISCONTINUED', 'EXPIRED')
      AND id IN (
        SELECT i."productId" FROM Inventory i
        WHERE i.quantity = 0
          AND i."productId" IN (
            SELECT DISTINCT b."productId" FROM "Batch" b
            WHERE b."expiryDate" IS NOT NULL AND date(b."expiryDate") <= date('now')
          )
          AND NOT EXISTS (
            SELECT 1 FROM "Batch" b2
            WHERE b2."productId" = i."productId"
              AND b2.quantity > 0
              AND (b2."expiryDate" IS NULL OR date(b2."expiryDate") > date('now'))
          )
      )
  `, []))

  // ── STEP 1: Batch-level auto-expiry ──
  // Use sqlRaw() for SELECT too — avoids the Turso {sql,args} bug that
  // silently returns 0 rows.
  const expiredBatches = await turso.execute(
    sqlRaw(`SELECT b.id, b."productId", b."batchNumber", b.quantity, b."costPrice",
                p.name as productName, p."sellingPrice"
         FROM "Batch" b
         INNER JOIN "Product" p ON p.id = b."productId"
         WHERE b."expiryDate" IS NOT NULL
           AND date(b."expiryDate") <= date('now')
           AND b.quantity > 0`, [])
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
  // but the product wasn't caught by batch-level expiry (e.g. no batches at all,
  // or batches with NULL expiry dates that hold stock while product-level expiry is past).
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
