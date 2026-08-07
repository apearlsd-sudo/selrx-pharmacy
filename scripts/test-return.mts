import { createClient } from '@libsql/client'

const c = createClient({ url: 'file:/home/z/my-project/db/custom.db' })

// Check if we have any transactions with items
const txResult = await c.execute(`
  SELECT t.id, t."transactionNo", t.status, COUNT(ti.id) as item_count
  FROM "Transaction" t
  LEFT JOIN "TransactionItem" ti ON ti."transactionId" = t.id
  GROUP BY t.id
  LIMIT 5
`)
console.log('Recent transactions:')
for (const row of txResult.rows) {
  console.log(`  ${row[1]} (${row[2]}) - ${row[3]} items`)
}

// Try a test INSERT into Return
const testId = 'test-return-001'
try {
  // First check if Return table accepts inserts
  await c.execute({
    sql: `INSERT INTO "Return" ("id", "returnNo", "transactionId", "transactionItemId",
           "productId", "productName", "quantity", "unitPrice", "refundAmount",
           "reason", "reasonNote", "customerId", "customerName", "userId",
           "status", "approvedById", "approvedAt", "refundMethod",
           "refundProcessed", "restocked", "notes", "createdAt", "updatedAt")
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      testId, 'RTN-TEST-0001', '', '', '', 'Test Product',
      1, 10.0, 10.0, 'DEFECTIVE', null, null, null, '',
      'PENDING_APPROVAL', null, null, 'CASH', 0, 0, null,
      new Date().toISOString(), new Date().toISOString(),
    ],
  })
  console.log('INSERT succeeded!')
  // Clean up
  await c.execute({ sql: 'DELETE FROM "Return" WHERE "id" = ?', args: [testId] })
  console.log('Test row deleted.')
} catch (e: any) {
  console.error('INSERT failed:', e.message)
}
