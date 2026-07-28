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

  // ── Inventory: ensure records exist for all products ───────────
  console.log('📦 Syncing Inventory records...')
  const { rows: products } = await turso.execute(
    `SELECT p."id" FROM "Product" p LEFT JOIN "Inventory" i ON p."id" = i."productId" WHERE i."id" IS NULL`
  )
  if (products.length > 0) {
    console.log(`  📝 Creating inventory for ${products.length} products without records...`)
    for (const p of products) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO "Inventory" ("id", "productId", "quantity", "createdAt", "updatedAt") VALUES (lower(hex(randomblob(16))), ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        args: [p.id],
      })
    }
    console.log(`  ✅ Inventory records created`)
  } else {
    console.log('  ⏭️  All products already have inventory records')
  }

  console.log('✅ Turso schema sync complete!')
}

main().catch(e => {
  console.error('❌ Turso schema sync failed:', e)
  process.exit(1)
})
