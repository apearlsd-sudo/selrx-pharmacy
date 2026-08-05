import { NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'

/**
 * POST /api/setup/ensure-batches
 *
 * One-time setup: creates the Batch table if missing and migrates
 * existing Inventory records into Batch rows.
 *
 * Safe to call multiple times — skips already-migrated products.
 */

export async function POST() {
  try {
    if (!isTurso()) {
      return NextResponse.json({ error: 'Batch setup requires Turso database' }, { status: 400 })
    }

    const results: string[] = []
    const now = new Date().toISOString()

    // 1. Create Batch table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS "Batch" (
        id            TEXT PRIMARY KEY,
        "productId"   TEXT NOT NULL REFERENCES "Product"(id),
        "batchNumber" TEXT,
        "expiryDate"  TEXT,
        quantity      INTEGER NOT NULL DEFAULT 0,
        "costPrice"   REAL,
        "receivedAt"  TEXT NOT NULL,
        "receivedBy"  TEXT,
        "createdAt"   TEXT NOT NULL,
        "updatedAt"   TEXT NOT NULL
      )
    `)
    results.push('Batch table created/verified')

    // 2. Find products with inventory but no batches
    const { rows: unmigrated } = await turso.execute(`
      SELECT i."productId", i.quantity, p."expiryDate", p."batchNumber", p."costPrice", p.name
      FROM Inventory i
      INNER JOIN "Product" p ON p.id = i."productId"
      LEFT JOIN "Batch" b ON b."productId" = i."productId"
      WHERE i.quantity > 0 AND b.id IS NULL
      GROUP BY i."productId"
    `)

    if (unmigrated.length > 0) {
      for (const row of unmigrated as any[]) {
        const productId = row.productId
        const qty = Number(row.quantity) || 0
        const expiryDate = row.expiryDate || null
        const batchNumber = row.batchNumber || null
        const costPrice = row.costPrice != null ? Number(row.costPrice) : null
        const productName = row.name
        const batchId = generateId()

        await turso.execute({
          sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "receivedBy", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [batchId, productId, batchNumber, expiryDate, qty, costPrice, now, 'migration', now, now],
        })
        results.push(`Migrated ${productName}: ${qty} units (expiry: ${expiryDate || 'none'})`)
      }
    } else {
      results.push('No unmigrated inventory found')
    }

    // 3. Backfill: Update batches with NULL expiryDate from Product.expiryDate
    //    where the product has an expiry date but the batch doesn't
    await turso.execute(`
      UPDATE "Batch"
      SET "expiryDate" = p."expiryDate", "updatedAt" = ?
      FROM "Product" p
      WHERE "Batch"."productId" = p.id
        AND "Batch"."expiryDate" IS NULL
        AND p."expiryDate" IS NOT NULL
    `, [now])
    const { rows: backfilled } = await turso.execute('SELECT changes() as cnt')
    results.push(`Backfilled ${Number((backfilled as any)[0]?.cnt || 0)} batch expiry dates from Product`)

    // 4. Update Product.expiryDate to MIN(active batch expiry) — exclude expired batches
    await turso.execute(`
      UPDATE "Product"
      SET "expiryDate" = (
        SELECT MIN(b."expiryDate")
        FROM "Batch" b
        WHERE b."productId" = "Product".id AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
      ), "updatedAt" = ?
      WHERE id IN (SELECT DISTINCT "productId" FROM "Batch" WHERE quantity > 0)
    `)
    results.push('Product expiry dates synced to earliest active batch')

    // 5. Report final state
    const { rows: batchCount } = await turso.execute('SELECT COUNT(*) as cnt FROM "Batch"')
    const totalBatches = Number((batchCount as any)[0]?.cnt || 0)

    return NextResponse.json({
      success: true,
      message: 'Batch tracking initialized',
      migratedProducts: unmigrated.length,
      totalBatches,
      details: results,
    })
  } catch (error) {
    console.error('Batch setup failed:', error)
    return NextResponse.json({ error: 'Batch setup failed', detail: String(error) }, { status: 500 })
  }
}
