import { createClient } from '@libsql/client'

const c = createClient({ url: 'file:/home/z/my-project/db/custom.db' })
const r = await c.execute("PRAGMA table_info('TransactionItem')")
console.log('TransactionItem columns:')
for (const row of r.rows) {
  console.log(`  ${row[1]} (${row[2]})`)
}