import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// Ensure ProductHistory table exists (idempotent)
let tableEnsured = false
async function ensureTable() {
  if (tableEnsured || !isTurso()) return
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
    tableEnsured = true
  } catch (err) {
    console.error('Failed to ensure ProductHistory table:', err)
  }
}

// ---------------------------------------------------------------------------
// GET /api/product-history?productId=...
// Returns creation + edit + delete history for a product
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }

    if (isTurso()) {
      const offset = (page - 1) * limit

      const [countResult, rowsResult] = await Promise.all([
        turso.execute({
          sql: `SELECT COUNT(*) as cnt FROM "ProductHistory" WHERE "productId" = ?`,
          args: [productId],
        }),
        turso.execute({
          sql: `SELECT ph.id, ph."productId", ph.action, ph."changedFields",
                       ph."previousValues", ph."newValues", ph."userId",
                       u.name as "userName",
                       ph."createdAt"
                FROM "ProductHistory" ph
                LEFT JOIN User u ON ph."userId" = u.id
                WHERE ph."productId" = ?
                ORDER BY ph."createdAt" DESC
                LIMIT ? OFFSET ?`,
          args: [productId, limit, offset],
        }),
      ])

      const total = Number(countResult.rows[0]?.cnt || 0)
      const history = rowsResult.rows.map((row) => ({
        id: row.id as string,
        productId: row.productId as string,
        action: row.action as string,
        changedFields: row.changedFields as string | null,
        previousValues: row.previousValues as string | null,
        newValues: row.newValues as string | null,
        userId: row.userId as string | null,
        userName: (row.userName as string) || 'Unknown',
        createdAt: row.createdAt as string,
      }))

      return NextResponse.json({ history, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const where = { productId }
    const [history, total] = await Promise.all([
      db.productHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, name: true } } },
      }),
      db.productHistory.count({ where }),
    ])

    return NextResponse.json({ history, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
  } catch (error) {
    console.error('Error fetching product history:', error)
    return NextResponse.json({ error: 'Failed to fetch product history' }, { status: 500 })
  }
}
