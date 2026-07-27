/**
 * Seed script: Exports local SQLite data and re-imports into a Turso database.
 *
 * Usage:
 *   # Export from local SQLite to JSON
 *   npx tsx prisma/seed.mts export
 *
 *   # Import JSON into Turso (set DATABASE_URL to your Turso URL first)
 *   DATABASE_URL=libsql://your-db.turso.io DATABASE_AUTH_TOKEN=xxx npx tsx prisma/seed.mts import
 */

import { PrismaClient } from '@prisma/client'

const MODELS = [
  'SystemRole',
  'User',
  'Customer',
  'Product',
  'Inventory',
  'Transaction',
  'TransactionItem',
  'Prescription',
  'HardwareLog',
  'Return',
  'Company',
  'Vendor',
  'Category',
  'AuditLog',
  'StockTake',
  'StockTakeItem',
] as const

// Order respects foreign-key dependencies
const IMPORT_ORDER = [
  'Company',
  'SystemRole',
  'User',
  'Customer',
  'Vendor',
  'Product',
  'Inventory',
  'Category',
  'Prescription',
  'Transaction',
  'TransactionItem',
  'Return',
  'HardwareLog',
  'AuditLog',
  'StockTake',
  'StockTakeItem',
] as const

async function exportData(prisma: PrismaClient) {
  const data: Record<string, any[]> = {}
  for (const model of MODELS) {
    // @ts-expect-error dynamic model access
    const rows = await (prisma as any)[model].findMany()
    data[model] = rows
    console.log(`Exported ${rows.length} ${model} records`)
  }
  const fs = await import('fs')
  fs.writeFileSync('prisma/seed-data.json', JSON.stringify(data, null, 2))
  console.log('Wrote prisma/seed-data.json')
}

async function importData(prisma: PrismaClient) {
  const fs = await import('fs')
  const raw = fs.readFileSync('prisma/seed-data.json', 'utf-8')
  const data = JSON.parse(raw)

  // Insert IDs map for resolving foreign keys during re-import
  for (const model of IMPORT_ORDER) {
    const rows = data[model]
    if (!rows || rows.length === 0) {
      console.log(`Skipping ${model} (no data)`)
      continue
    }
    try {
      // @ts-expect-error dynamic model access
      await (prisma as any)[model].createMany({
        data: rows,
        skipDuplicates: true,
      })
      console.log(`Imported ${rows.length} ${model} records`)
    } catch (e: any) {
      console.error(`Error importing ${model}: ${e.message}`)
    }
  }
  console.log('Import complete.')
}

async function main() {
  const mode = process.argv[2]
  if (mode !== 'export' && mode !== 'import') {
    console.log('Usage: npx tsx prisma/seed.mts [export|import]')
    process.exit(1)
  }

  const prisma = new PrismaClient()

  if (mode === 'export') {
    await exportData(prisma)
  } else {
    await importData(prisma)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
