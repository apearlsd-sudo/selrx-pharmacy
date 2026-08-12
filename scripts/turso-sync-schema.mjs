#!/usr/bin/env node
/**
 * turso-sync-schema.mjs
 *
 * Ensures ALL Prisma schema tables and columns exist in Turso cloud DB.
 * Uses raw SQL since Prisma can't push to Turso directly with sqlite provider.
 * Safe to run repeatedly (idempotent) — uses IF NOT EXISTS / ALTER ADD COLUMN.
 *
 * Usage: Called automatically by `npm run build` on Vercel after adapter install.
 */
import { createClient } from '@libsql/client'

const TURSO_URL = process.env.TURSO_DATABASE_URL
const AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN

if (!TURSO_URL) {
  console.log('ℹ️  No TURSO_DATABASE_URL — skipping Turso schema sync (using local SQLite)')
  process.exit(0)
}

async function run(turso, sql) {
  await turso.execute(sql)
}

/** ALTER TABLE ADD COLUMN — catches "duplicate column" to make it idempotent */
async function addColumn(turso, table, column, def) {
  try {
    await turso.execute(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${def};`)
    console.log(`  ✅ ${table}.${column} added`)
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log(`  ⏭️  ${table}.${column} already exists`)
    } else {
      throw e
    }
  }
}

async function main() {
  console.log('🔄 Turso schema sync starting...')
  const turso = createClient({ url: TURSO_URL, authToken: AUTH_TOKEN })

  // ── Manufacturer table ─────────────────────────────────────────────
  console.log('📦 Syncing Manufacturer table...')
  await run(turso, `
    CREATE TABLE IF NOT EXISTS "Manufacturer" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "contactPerson" TEXT,
      "email" TEXT,
      "phone" TEXT,
      "address" TEXT,
      "city" TEXT,
      "country" TEXT,
      "website" TEXT,
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `)
  await run(turso, `CREATE UNIQUE INDEX IF NOT EXISTS "Manufacturer_name_key" ON "Manufacturer"("name");`)

  // ── Vendor table ──────────────────────────────────────────────────
  console.log('📦 Syncing Vendor table...')
  await run(turso, `
    CREATE TABLE IF NOT EXISTS "Vendor" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "contactPerson" TEXT,
      "email" TEXT,
      "phone" TEXT,
      "address" TEXT,
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `)
  await run(turso, `CREATE UNIQUE INDEX IF NOT EXISTS "Vendor_name_key" ON "Vendor"("name");`)

  // ── Category table ────────────────────────────────────────────────
  console.log('📦 Syncing Category table...')
  await run(turso, `
    CREATE TABLE IF NOT EXISTS "Category" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `)
  await run(turso, `CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name");`)

  // ── CategoryToProduct junction table ───────────────────────────────
  console.log('📦 Syncing _CategoryToProduct junction table...')
  await run(turso, `
    CREATE TABLE IF NOT EXISTS "_CategoryToProduct" (
      "A" TEXT NOT NULL,
      "B" TEXT NOT NULL,
      FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `)
  await run(turso, `CREATE UNIQUE INDEX IF NOT EXISTS "_CategoryToProduct_AB_unique" ON "_CategoryToProduct"("A","B");`)
  await run(turso, `CREATE INDEX IF NOT EXISTS "_CategoryToProduct_B_index" ON "_CategoryToProduct"("B");`)

  // ── Product columns ──────────────────────────────────────────────
  console.log('📦 Syncing Product columns...')
  await addColumn(turso, 'Product', 'manufacturerId', 'TEXT')
  await addColumn(turso, 'Product', 'vendorId', 'TEXT')
  await addColumn(turso, 'Product', 'manufacturer', 'TEXT')
  await addColumn(turso, 'Product', 'dosageForm', 'TEXT')
  await addColumn(turso, 'Product', 'expiredAt', 'TEXT')
  await addColumn(turso, 'Product', 'barcode', 'TEXT')

  // ── Inventory: ensure records exist for all products ───────────
  console.log('📦 Syncing Inventory records...')

  // Ensure Inventory table exists
  await run(turso, `
    CREATE TABLE IF NOT EXISTS "Inventory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "productId" TEXT NOT NULL UNIQUE,
      "quantity" INTEGER NOT NULL DEFAULT 0,
      "lastCounted" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("productId") REFERENCES "Product"("id")
    );
  `)

  // Find products with no inventory record
  const { rows: products } = await turso.execute(
    `SELECT p."id" FROM "Product" p LEFT JOIN "Inventory" i ON p."id" = i."productId" WHERE i."id" IS NULL`
  )
  if (products.length > 0) {
    console.log(`  📝 Creating inventory for ${products.length} products without records...`)
    // Seed with reasonable random quantities (20-200)
    for (const p of products) {
      const qty = Math.floor(Math.random() * 180) + 20 // 20-199
      await turso.execute({
        sql: `INSERT OR IGNORE INTO "Inventory" ("id", "productId", "quantity", "lastCounted", "createdAt", "updatedAt") VALUES (lower(hex(randomblob(16))), ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        args: [p.id, qty],
      })
    }
    console.log(`  ✅ Inventory records created with seeded quantities`)
  } else {
    console.log('  ⏭️  All products already have inventory records')
  }

  // Also fix any existing inventory records that have NULL or 0 quantity
  // Only runs when SEED_STOCK=true to avoid re-seeding on every build
  if (process.env.SEED_STOCK === 'true') {
    const { rows: zeroQty } = await turso.execute(
      `SELECT "id", "productId" FROM "Inventory" WHERE "quantity" IS NULL OR "quantity" = 0`
    )
    if (zeroQty.length > 0) {
      console.log(`  📝 Updating ${zeroQty.length} zero-quantity inventory records...`)
      for (const inv of zeroQty) {
        const qty = Math.floor(Math.random() * 180) + 20
        await turso.execute({
          sql: `UPDATE "Inventory" SET "quantity" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
          args: [qty, inv.id],
        })
      }
      console.log(`  ✅ Zero-quantity records updated`)
    }
  } else {
    console.log('  ⏭️  Skipping zero-quantity seed (set SEED_STOCK=true to enable)')
  }

  // ── Batch table (per-receipt lot tracking with individual expiry dates) ──
  console.log('📦 Syncing Batch table...')
  await run(turso, `
    CREATE TABLE IF NOT EXISTS "Batch" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "productId" TEXT NOT NULL,
      "batchNumber" TEXT,
      "expiryDate" TEXT,
      "quantity" INTEGER NOT NULL DEFAULT 0,
      "costPrice" REAL,
      "receivedAt" TEXT NOT NULL,
      "receivedBy" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL,
      FOREIGN KEY ("productId") REFERENCES "Product"(id)
    );
  `)
  await run(turso, `CREATE INDEX IF NOT EXISTS "Batch_productId_idx" ON "Batch"("productId");`)
  await run(turso, `CREATE INDEX IF NOT EXISTS "Batch_expiryDate_idx" ON "Batch"("expiryDate");`)

  // Migrate existing single-expiry products into batches (one-time)
  const { rows: unmigrated } = await turso.execute(`
    SELECT p.id, p."expiryDate", p."batchNumber", p."costPrice",
           COALESCE(i.quantity, 0) as qty, i.id as invId
    FROM "Product" p
    LEFT JOIN "Inventory" i ON i."productId" = p.id
    LEFT JOIN "Batch" b ON b."productId" = p.id
    WHERE p."expiryDate" IS NOT NULL
      AND i.quantity > 0
      AND b.id IS NULL
  `)
  if (unmigrated.length > 0) {
    console.log(`  📝 Migrating ${unmigrated.length} products with expiry dates into batch records...`)
    const batchStmts = unmigrated.map((row) => {
      const batchId = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
      const now = new Date().toISOString()
      return {
        sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "createdAt", "updatedAt")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [batchId, row[0], row[2], row[1], row[4], row[3], now, now, now],
      }
    })
    await turso.batch(batchStmts)
    console.log(`  ✅ Batch records created for ${unmigrated.length} products`)
  } else {
    console.log('  ⏭️  All products with expiry dates already have batch records')
  }

  // ── Shift table (per-user shift tracking) ──
  console.log('📦 Syncing Shift table...')
  await run(turso, `
    CREATE TABLE IF NOT EXISTS "Shift" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "userName" TEXT,
      "startedAt" TEXT NOT NULL,
      "endedAt" TEXT,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "totalSales" REAL NOT NULL DEFAULT 0,
      "totalTransactions" INTEGER NOT NULL DEFAULT 0,
      "totalItemsSold" INTEGER NOT NULL DEFAULT 0,
      "cashAtStart" REAL,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL
    );
  `)
  await run(turso, `CREATE INDEX IF NOT EXISTS "Shift_userId_idx" ON "Shift"("userId");`)
  await run(turso, `CREATE INDEX IF NOT EXISTS "Shift_status_idx" ON "Shift"("status");`)
  await addColumn(turso, 'Shift', 'cashAtEnd', 'REAL')
  await addColumn(turso, 'Shift', 'expectedCash', 'REAL')
  await addColumn(turso, 'Shift', 'cashDiscrepancy', 'REAL')

  // ── ShiftInventory table (inventory snapshot at shift end) ──
  console.log('📦 Syncing ShiftInventory table...')
  await run(turso, `
    CREATE TABLE IF NOT EXISTS "ShiftInventory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "shiftId" TEXT NOT NULL,
      "productId" TEXT NOT NULL,
      "productName" TEXT,
      "quantity" INTEGER NOT NULL DEFAULT 0,
      "sellingPrice" REAL,
      "costPrice" REAL,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE
    );
  `)
  await run(turso, `CREATE INDEX IF NOT EXISTS "ShiftInventory_shiftId_idx" ON "ShiftInventory"("shiftId");`)
  await run(turso, `CREATE INDEX IF NOT EXISTS "ShiftInventory_productId_idx" ON "ShiftInventory"("productId");`)
  await addColumn(turso, 'ShiftInventory', 'category', 'TEXT')

  // ── AuditLog table (enhanced with category/entity) ──
  console.log('📦 Syncing AuditLog table...')
  await run(turso, `
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      action TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      entity TEXT,
      "entityId" TEXT,
      details TEXT,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await run(turso, `CREATE INDEX IF NOT EXISTS "idx_auditlog_category" ON "AuditLog"(category)`)
  await run(turso, `CREATE INDEX IF NOT EXISTS "idx_auditlog_user" ON "AuditLog"("userId")`)
  await run(turso, `CREATE INDEX IF NOT EXISTS "idx_auditlog_created" ON "AuditLog"("createdAt")`)
  await addColumn(turso, 'AuditLog', 'entity', 'TEXT')
  await addColumn(turso, 'AuditLog', 'entityId', 'TEXT')
  await addColumn(turso, 'AuditLog', 'userAgent', 'TEXT')

  // ── Company: add settings column for JSON settings storage ──
  console.log('📦 Syncing Company table columns...')
  await addColumn(turso, 'Company', 'settings', 'TEXT')

  // ── PurchaseOrder table ──
  console.log('📦 Syncing PurchaseOrder table...')
  await run(turso, `
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
  await run(turso, `CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx" ON "PurchaseOrder"(status)`)
  await run(turso, `CREATE INDEX IF NOT EXISTS "PurchaseOrder_vendor_idx" ON "PurchaseOrder"("vendorId")`)

  // ── PurchaseOrderItem table ──
  console.log('📦 Syncing PurchaseOrderItem table...')
  await run(turso, `
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
  await run(turso, `CREATE INDEX IF NOT EXISTS "POItem_order_idx" ON "PurchaseOrderItem"("orderId")`)
  await run(turso, `CREATE INDEX IF NOT EXISTS "POItem_product_idx" ON "PurchaseOrderItem"("productId")`)

  // ── Migrations for existing tables (add missing columns) ──
  console.log('🔄 Running migrations for existing tables...')
  const migrations = [
    `ALTER TABLE "AuditLog" ADD COLUMN category TEXT NOT NULL DEFAULT 'general'`,
    `ALTER TABLE "AuditLog" ADD COLUMN entity TEXT`,
    `ALTER TABLE "AuditLog" ADD COLUMN "entityId" TEXT`,
    `ALTER TABLE "AuditLog" ADD COLUMN "userAgent" TEXT`,
  ]
  for (const sql of migrations) {
    try { await run(turso, sql) } catch { /* column may already exist */ }
  }

  console.log('✅ Turso schema sync complete!')
}

main().catch(e => {
  console.error('⚠️  Turso schema sync failed (non-fatal):', e.message)
  process.exit(0)
})
