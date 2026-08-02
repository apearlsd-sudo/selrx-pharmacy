import { turso, isTurso, generateId } from './turso'

// Ensure ProductHistory table exists (idempotent)
let ensured = false
async function ensureTable() {
  if (ensured || !isTurso()) return
  try {
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
    ensured = true
  } catch (err) {
    console.error('Failed to ensure ProductHistory table:', err)
  }
}

/**
 * Write a ProductHistory entry (fire-and-forget, non-blocking)
 * Used after product CREATE, UPDATE, DELETE.
 */
export async function writeProductHistory(params: {
  productId: string
  action: 'CREATED' | 'UPDATED' | 'DELETED' | 'EXPIRED'
  changedFields?: string[]
  previousValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  userId?: string
  requestId?: string
}) {
  try {
    const now = new Date().toISOString()
    const id = generateId()
    const changedStr = params.changedFields?.length ? params.changedFields.join(', ') : null
    const prevStr = params.previousValues ? JSON.stringify(params.previousValues) : null
    const newStr = params.newValues ? JSON.stringify(params.newValues) : null
    const userId = params.userId || ''

    if (isTurso()) {
      await ensureTable()
      await turso.execute({
        sql: `INSERT INTO "ProductHistory" (id, "productId", action, "changedFields", "previousValues", "newValues", "userId", "createdAt")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, params.productId, params.action, changedStr, prevStr, newStr, userId, now],
      })
    } else {
      const { db } = await import('./db')
      await db.productHistory.create({
        data: {
          productId: params.productId,
          action: params.action,
          changedFields: changedStr,
          previousValues: prevStr,
          newValues: newStr,
          userId,
        },
      })
    }
  } catch (err) {
    // Fire-and-forget: log but never throw
    console.error('Failed to write product history:', err)
  }
}
