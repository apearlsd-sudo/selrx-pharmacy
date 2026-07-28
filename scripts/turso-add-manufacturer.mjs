/**
 * turso-add-manufacturer.mjs
 * Adds Manufacturer table and manufacturerId column to Product in Turso.
 * Uses raw SQL since Prisma can't push to Turso directly with sqlite provider.
 */
import { createClient } from '@libsql/client'

const TURSO_URL = process.env.TURSO_DATABASE_URL
const AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN

if (!TURSO_URL) {
  console.error('TURSO_DATABASE_URL is required')
  process.exit(1)
}

async function main() {
  console.log('Connecting to Turso...')
  const turso = createClient({
    url: TURSO_URL,
    authToken: AUTH_TOKEN,
  })

  // 1. Create Manufacturer table
  console.log('Creating Manufacturer table...')
  await turso.execute(`
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
  await turso.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "Manufacturer_name_key" ON "Manufacturer"("name");`)
  console.log('Manufacturer table created.')

  // 2. Add manufacturerId column to Product (if not exists)
  console.log('Adding manufacturerId to Product...')
  try {
    await turso.execute(`ALTER TABLE "Product" ADD COLUMN "manufacturerId" TEXT;`)
    console.log('manufacturerId column added.')
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('manufacturerId column already exists, skipping.')
    } else {
      throw e
    }
  }

  // 3. Add foreign key constraint (SQLite doesn't support ALTER ADD CONSTRAINT,
  //    so we rely on the Prisma relation mapping at the app level)
  console.log('Done! Manufacturer table is ready on Turso.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
