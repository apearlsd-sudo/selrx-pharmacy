/**
 * migrate-batches.ts
 *
 * One-time migration script:
 * 1. Creates the Batch table if it doesn't exist
 * 2. Migrates existing Inventory records into Batch records
 * 3. Updates Product.expiryDate to MIN(batch expiry) per product
 *
 * Usage: npx tsx scripts/migrate-batches.ts
 */

import { createClient } from '@libsql/client'

const TURSO_URL = process.env.TURSO_DATABASE_URL!
const TURSO_AUTH = process.env.TURSO_API_TOKEN || undefined

async function main() {
  const db = createClient({ url: TURSO_URL, authToken: TURSO_AUTH })

  // 1. Create Batch table
  console.log('📋 Creating Batch table if not exists...')
  await db.execute(`
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
  console.log('✅ Batch table ready')

  // 2. Check if migration is needed (products with inventory but no batches)
  const { rows: unmigrated } = await db.execute(`
    SELECT i."productId", i.quantity, p."expiryDate", p."batchNumber", p."costPrice", p.name
    FROM Inventory i
    INNER JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Batch" b ON b."productId" = i."productId"
    WHERE i.quantity > 0 AND b.id IS NULL
    GROUP BY i."productId"
  `)

  if (unmigrated.length === 0) {
    console.log('✅ All inventory already migrated to batches — nothing to do')
    process.exit(0)
  }

  console.log(`📦 Migrating ${unmigrated.length} products to batch tracking...`)

  const now = new Date().toISOString()
  const { nanoid } = await import('nanoid')

  for (const row of unmigrated as any[]) {
    const productId = row.productId
    const qty = Number(row.quantity) || 0
    const expiryDate = row.expiryDate || null
    const batchNumber = row.batchNumber || null
    const costPrice = row.costPrice != null ? Number(row.costPrice) : null
    const productName = row.name
    const batchId = nanoid(25)

    await db.execute({
      sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "receivedBy", "createdAt", "updatedAt")
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [batchId, productId, batchNumber, expiryDate, qty, costPrice, now, 'migration', now, now],
    })
    console.log(`  ✅ ${productName}: ${qty} units (expiry: ${expiryDate || 'none'}, batch: ${batchNumber || 'none'})`)
  }

  // 3. Update Product.expiryDate to MIN(batch expiry) for all products with batches
  console.log('\n🔄 Updating Product.expiryDate to earliest batch expiry...')
  await db.execute(`
    UPDATE "Product"
    SET "expiryDate" = (
      SELECT MIN(b."expiryDate")
      FROM "Batch" b
      WHERE b."productId" = "Product".id AND b."expiryDate" IS NOT NULL AND b.quantity > 0
    ), "updatedAt" = ?
    WHERE id IN (SELECT DISTINCT "productId" FROM "Batch" WHERE quantity > 0)
  `)
  console.log('✅ Product expiry dates updated')

  console.log('\n🎉 Migration complete!')
  process.exit(0)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
