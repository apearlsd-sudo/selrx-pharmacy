/**
 * push-schema-to-turso.mts
 * Reads the local SQLite schema and pushes it to Turso.
 * Then seeds data from seed-data.json.
 *
 * Usage:
 *   DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="..." npx tsx scripts/push-schema-to-turso.mts
 */

import { createClient, type Client } from '@libsql/client'
import { readFileSync } from 'fs'

const DB_URL = process.env.DATABASE_URL!
const AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN

async function main() {
  console.log(`Connecting to ${DB_URL}...`)
  const turso: Client = createClient({
    url: DB_URL,
    authToken: AUTH_TOKEN,
  })

  // 1. Read schema from local SQLite
  const localClient: Client = createClient({
    url: 'file:/home/z/my-project/db/custom.db',
  })

  const schemaResult = await localClient.execute(
    "SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name"
  )
  const idxResult = await localClient.execute(
    "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND sql != '' ORDER BY name"
  )

  // 2. Drop existing tables in Turso (reverse order to handle FKs)
  const existingTables = await turso.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  const tableNames = existingTables.rows.map(r => r.name).reverse()
  for (const t of tableNames) {
    await turso.execute({ sql: `DROP TABLE IF EXISTS \`${t}\`` })
    console.log(`Dropped existing table: ${t}`)
  }

  // 3. Create tables in Turso
  for (const row of schemaResult.rows) {
    if (row.sql) {
      await turso.execute({ sql: row.sql + ';' })
      // Extract table name
      const match = row.sql.match(/CREATE\s+TABLE\s+[`"]?(\w+)[`"]?/i)
      console.log(`Created table: ${match?.[1] || '?'}`)
    }
  }

  // 4. Create indexes
  for (const row of idxResult.rows) {
    if (row.sql) {
      await turso.execute({ sql: row.sql + ';' })
      console.log(`Created index`)
    }
  }

  console.log(`\nSchema push complete: ${schemaResult.rows.length} tables, ${idxResult.rows.length} indexes`)

  // Disable FK checks during seeding
  await turso.execute({ sql: 'PRAGMA foreign_keys = OFF;' })

  // 5. Seed data
  const data = JSON.parse(readFileSync('/home/z/my-project/prisma/seed-data.json', 'utf-8'))

  const importOrder = [
    'Company', 'SystemRole', 'User', 'Customer', 'Vendor',
    'Product', 'Inventory', 'Category', 'Prescription',
    'Transaction', 'TransactionItem', 'Return',
    'HardwareLog', 'AuditLog', 'StockTake', 'StockTakeItem',
  ]

  for (const model of importOrder) {
    const rows = data[model]
    if (!rows || rows.length === 0) {
      console.log(`Skip ${model} (no data)`)
      continue
    }

    // Build INSERT statement from the first row's keys (include ALL fields)
    const keys = Object.keys(rows[0])
    const cols = keys.join(', ')
    const placeholders = keys.map(() => '?').join(', ')

    for (const row of rows) {
      const values = keys.map(k => row[k])
      try {
        await turso.execute({
          sql: `INSERT INTO \`${model}\` (${cols}) VALUES (${placeholders})`,
          args: values,
        })
      } catch (e: any) {
        console.error(`Error inserting ${model}: ${e.message}`)
      }
    }
    console.log(`Seeded ${rows.length} ${model} records`)
  }

  // 6. Verify
  const verify = await turso.execute(`
    SELECT 'SystemRole' as tbl, COUNT(*) as cnt FROM SystemRole
    UNION ALL SELECT 'User', COUNT(*) FROM User
    UNION ALL SELECT 'Company', COUNT(*) FROM Company
  `)
  console.log('\nVerification:')
  for (const r of verify.rows) {
    console.log(`  ${r.tbl}: ${r.cnt} rows`)
  }

  console.log('\nDone! Turso database is ready.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
