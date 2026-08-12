import { turso, isTurso, generateId } from './turso'

// Ensure AuditLog table exists in Turso (idempotent)
let ensured = false
async function ensureTable() {
  if (ensured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "AuditLog" (
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
    )`,
      args: [],
    })
    // Create index for faster querying
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_auditlog_category" ON "AuditLog"(category)`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_auditlog_user" ON "AuditLog"("userId")`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_auditlog_created" ON "AuditLog"("createdAt")`,
      args: [],
    })
    ensured = true
  } catch (err) {
    console.error('Failed to ensure AuditLog table:', err)
  }
}

export type AuditCategory =
  | 'auth'        // login, logout, session
  | 'transaction' // sale, void, return
  | 'inventory'   // adjustment, receiving, stock take
  | 'product'     // create, update, delete
  | 'customer'    // create, update, delete
  | 'prescription'// create, fill, verify, cancel
  | 'user'        // create, update, delete, role change
  | 'system'      // backup, restore, settings change, company setup
  | 'purchase'    // PO create, receive, cancel
  | 'general'     // anything else

export interface AuditLogParams {
  userId: string
  action: string
  category?: AuditCategory
  entity?: string      // e.g. 'Product', 'Transaction', 'User'
  entityId?: string   // the ID of the entity
  details?: string | Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

/**
 * Write an audit log entry (fire-and-forget, non-blocking).
 * Call from every mutation endpoint.
 */
export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const now = new Date().toISOString()
    const id = generateId()
    const category = params.category || 'general'
    const details = typeof params.details === 'string'
      ? params.details
      : params.details
        ? JSON.stringify(params.details)
        : null

    if (isTurso()) {
      await ensureTable()
      await turso.execute({
        sql: `INSERT INTO "AuditLog" (id, "userId", action, category, entity, "entityId", details, "ipAddress", "userAgent", "createdAt")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, params.userId, params.action, category, params.entity || null, params.entityId || null, details, params.ipAddress || null, params.userAgent || null, now],
      })
    } else {
      const { db } = await import('./db')
      await db.auditLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          details,
          ipAddress: params.ipAddress,
        },
      })
    }
  } catch (err) {
    // Fire-and-forget: log but never throw
    console.error('[audit] Failed to write audit log:', err)
  }
}

/** Extract user ID and IP from a NextRequest object */
export function getRequestContext(req: Request): { userId: string; ipAddress: string; userAgent: string } {
  return {
    userId: (req.headers.get('x-user-id') || 'anonymous'),
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  }
}
