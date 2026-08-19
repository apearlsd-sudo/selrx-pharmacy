import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toObjs(result: { columns: Array<string>; rows: Array<Array<unknown>> }) {
  const names = result.columns.map((c) => c)
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((n, i) => { obj[n] = row[i] })
    return obj
  })
}

// Self-healing: ensure the Notification table exists in Turso (for future use)
let tableEnsured = false
async function ensureNotificationTable() {
  if (tableEnsured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "Notification" (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        "entityType" TEXT,
        "entityId" TEXT,
        status TEXT NOT NULL DEFAULT 'UNREAD',
        "userId" TEXT,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        "readAt" TEXT
      )`,
      args: [],
    })
    // Self-healing ALTER TABLE
    const migrations = [
      `ALTER TABLE "Notification" ADD COLUMN "entityType" TEXT`,
      `ALTER TABLE "Notification" ADD COLUMN "entityId" TEXT`,
      `ALTER TABLE "Notification" ADD COLUMN "readAt" TEXT`,
      `ALTER TABLE "Notification" ADD COLUMN "userId" TEXT`,
    ]
    for (const sql of migrations) {
      try { await turso.execute({ sql, args: [] }) } catch { /* duplicate column — ignore */ }
    }
    tableEnsured = true
  } catch (err) {
    console.error('[alerts] Failed to ensure Notification table:', err)
  }
}

// ---------------------------------------------------------------------------
// GET /api/alerts
// Returns generated alerts from existing data (expiry + reorder)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    // Require auth
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Self-healing: ensure Notification table exists (for future use)
    if (isTurso()) await ensureNotificationTable()

    if (isTurso()) {
      const [expiringResult, reorderResult] = await Promise.all([
        // Products expiring within 90 days
        turso.execute({
          sql: `SELECT p."id", p."name", p."ndc", p."category", p."sellingPrice", i."quantity",
                 p."expiryDate", p."batchNumber", p."storageLocation"
          FROM Product p JOIN Inventory i ON i."productId" = p."id"
          WHERE p."status" = 'ACTIVE' AND p."expiryDate" IS NOT NULL
            AND p."expiryDate" != ''
            AND date(p."expiryDate") >= date('now')
            AND date(p."expiryDate") <= date('now', '+90 days')
          ORDER BY date(p."expiryDate") ASC
          LIMIT 50`,
          args: [],
        }),

        // Products below reorder point
        turso.execute({
          sql: `SELECT p."id", p."name", p."ndc", p."category", p."sellingPrice", p."costPrice",
                 i."quantity", p."reorderPoint", p."reorderQty", p."storageLocation"
          FROM Product p JOIN Inventory i ON i."productId" = p."id"
          WHERE p."status" = 'ACTIVE' AND i."quantity" <= p."reorderPoint"
          ORDER BY i."quantity" ASC
          LIMIT 50`,
          args: [],
        }),
      ])

      const expiringSoon = toObjs(expiringResult).map((r) => ({
        id: r.id,
        name: r.name,
        ndc: r.ndc,
        category: r.category,
        sellingPrice: r.sellingPrice,
        quantity: r.quantity,
        expiryDate: r.expiryDate,
        batchNumber: r.batchNumber,
        storageLocation: r.storageLocation,
      }))

      const belowReorder = toObjs(reorderResult).map((r) => ({
        id: r.id,
        name: r.name,
        ndc: r.ndc,
        category: r.category,
        sellingPrice: r.sellingPrice,
        costPrice: r.costPrice,
        quantity: r.quantity,
        reorderPoint: r.reorderPoint,
        reorderQty: r.reorderQty,
        storageLocation: r.storageLocation,
      }))

      return NextResponse.json({ expiringSoon, belowReorder })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const now = new Date()
    const in90Days = new Date(now)
    in90Days.setDate(in90Days.getDate() + 90)

    const [expiringProducts, reorderProducts] = await Promise.all([
      db.product.findMany({
        where: {
          status: 'ACTIVE',
          expiryDate: { not: null, gte: now, lte: in90Days },
        },
        include: { inventory: true },
        orderBy: { expiryDate: 'asc' },
        take: 50,
      }),
      db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT p."id", p."name", p."ndc", p."category", p."sellingPrice", p."costPrice",
               i."quantity", p."reorderPoint", p."reorderQty", p."storageLocation"
        FROM Product p JOIN Inventory i ON i."productId" = p."id"
        WHERE p."status" = 'ACTIVE' AND i."quantity" <= p."reorderPoint"
        ORDER BY i."quantity" ASC
        LIMIT 50
      `,
    ])

    const expiringSoon = expiringProducts.map((p) => ({
      id: p.id,
      name: p.name,
      ndc: p.ndc,
      category: p.category,
      sellingPrice: p.sellingPrice,
      quantity: p.inventory?.[0]?.quantity ?? 0,
      expiryDate: p.expiryDate?.toISOString() || null,
      batchNumber: p.batchNumber,
      storageLocation: p.storageLocation,
    }))

    const belowReorder = reorderProducts.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      ndc: r.ndc as string,
      category: r.category as string,
      sellingPrice: r.sellingPrice as number,
      costPrice: r.costPrice as number,
      quantity: r.quantity as number,
      reorderPoint: r.reorderPoint as number,
      reorderQty: r.reorderQty as number,
      storageLocation: r.storageLocation as string,
    }))

    return NextResponse.json({ expiringSoon, belowReorder })
  } catch (error) {
    console.error('Error fetching alerts:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch alerts', detail: msg }, { status: 500 })
  }
}
