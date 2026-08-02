// Run once to create ProductHistory table in Turso
import { turso } from '../src/lib/turso'

async function main() {
  console.log('Creating ProductHistory table...')
  await turso.execute({
    sql: `CREATE TABLE IF NOT EXISTS "ProductHistory" (
      id TEXT PRIMARY KEY,
      "productId" TEXT NOT NULL REFERENCES "Product"(id),
      action TEXT NOT NULL,
      "changedFields" TEXT,
      "previousValues" TEXT,
      "newValues" TEXT,
      "userId" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    args: [],
  })
  console.log('ProductHistory table created successfully!')
}

main().catch(console.error)