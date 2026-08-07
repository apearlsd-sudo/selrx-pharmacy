import { createClient } from '@libsql/client'

const c = createClient({ url: 'file:/home/z/my-project/db/custom.db' })
const r = await c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='Return'")
console.log('Return table:', r.rows[0]?.sql || 'NOT FOUND')

const ti = await c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='TransactionItem'")
console.log('TransactionItem table:', ti.rows[0]?.sql || 'NOT FOUND')
