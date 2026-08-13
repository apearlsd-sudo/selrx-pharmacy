/**
 * Runtime table creation for PurchaseOrder + PurchaseOrderItem.
 * Safe to call repeatedly — uses IF NOT EXISTS.
 * Covers the case where the build-time turso-sync-schema.mjs
 * didn't run or failed silently on Vercel.
 */
import { turso, isTurso } from './turso'

let ensured = false

export async function ensurePOTables(): Promise<void> {
  if (ensured || !isTurso()) return
  try {
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
        id TEXT PRIMARY KEY,
        "vendorId" TEXT,
        vendorName TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        notes TEXT,
        "expectedDate" TEXT,
        "totalAmount" REAL NOT NULL DEFAULT 0,
        "receivedAmount" REAL NOT NULL DEFAULT 0,
        "createdBy" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
    await turso.execute(`CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx" ON "PurchaseOrder"(status)`)
    await turso.execute(`CREATE INDEX IF NOT EXISTS "PurchaseOrder_vendor_idx" ON "PurchaseOrder"("vendorId")`)

    await turso.execute(`
      CREATE TABLE IF NOT EXISTS "PurchaseOrderItem" (
        id TEXT PRIMARY KEY,
        "orderId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        productName TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        "receivedQty" INTEGER NOT NULL DEFAULT 0,
        "unitCost" REAL NOT NULL DEFAULT 0,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"(id) ON DELETE CASCADE
      );
    `)
    await turso.execute(`CREATE INDEX IF NOT EXISTS "POItem_order_idx" ON "PurchaseOrderItem"("orderId")`)
    await turso.execute(`CREATE INDEX IF NOT EXISTS "POItem_product_idx" ON "PurchaseOrderItem"("productId")`)

    ensured = true
    console.log('[ensure-po-tables] PurchaseOrder + PurchaseOrderItem tables ready')
  } catch (err) {
    console.error('[ensure-po-tables] Failed to ensure tables:', err)
  }
}
