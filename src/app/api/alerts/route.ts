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

function daysUntilExpiry(expiryDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(expiryDate)
  exp.setHours(0, 0, 0, 0)
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ---------------------------------------------------------------------------
// GET /api/alerts
// Query params:
//   ?type=expiringSoon  → return only { items: [...] }
//   ?type=belowReorder  → return only { items: [...] }
//   (no type)           → return { expiringSoon: [...], belowReorder: [...] }
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const alertType = searchParams.get('type') // 'expiringSoon' | 'belowReorder' | null
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 50)

    if (isTurso()) {
      const fetchExpiring = async () => {
        const result = await turso.execute({
          sql: `SELECT b.id AS "batchId", b."productId", b."batchNumber", b."expiryDate",
                 b.quantity AS "batchQty",
                 p."name",
                 COALESCE(i."quantity", 0) AS "quantity"
          FROM "Batch" b
          JOIN Product p ON p."id" = b."productId"
          LEFT JOIN Inventory i ON i."productId" = p."id"
          WHERE p."status" = 'ACTIVE'
            AND b."expiryDate" IS NOT NULL
            AND b."expiryDate" != ''
            AND b.quantity > 0
            AND date(b."expiryDate") >= date('now')
            AND date(b."expiryDate") <= date('now', '+14 days')
          ORDER BY date(b."expiryDate") ASC
          LIMIT ?`,
          args: [String(limit)],
        })
        return toObjs(result).map((r) => ({
          productId: String(r.productId),
          productName: r.name,
          expiryDate: r.expiryDate as string,
          quantity: Number(r.quantity),
          batchQty: Number(r.batchQty),
          batchNumber: r.batchNumber,
          batchId: r.batchId,
          daysToExpiry: daysUntilExpiry(r.expiryDate as string),
        }))
      }

      const fetchReorder = async () => {
        const result = await turso.execute({
          sql: `SELECT p."id", p."name",
                 i."quantity", p."reorderPoint", p."reorderQty"
          FROM Product p JOIN Inventory i ON i."productId" = p."id"
          WHERE p."status" = 'ACTIVE' AND i."quantity" <= p."reorderPoint"
          ORDER BY i."quantity" ASC
          LIMIT ?`,
          args: [String(limit)],
        })
        return toObjs(result).map((r) => ({
          productId: r.id as string,
          productName: r.name as string,
          quantity: Number(r.quantity),
          reorderPoint: Number(r.reorderPoint),
          reorderQty: Number(r.reorderQty),
        }))
      }

      if (alertType === 'expiringSoon') {
        const items = await fetchExpiring()
        return NextResponse.json({ items })
      }
      if (alertType === 'belowReorder') {
        const items = await fetchReorder()
        return NextResponse.json({ items })
      }

      // No type specified — return both
      const [expiringSoon, belowReorder] = await Promise.all([fetchExpiring(), fetchReorder()])
      return NextResponse.json({ expiringSoon, belowReorder })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const now = new Date()
    const in14Days = new Date(now)
    in14Days.setDate(in14Days.getDate() + 14)

    const fetchExpiring = async () => {
      const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT b.id AS "batchId", b."productId", b."batchNumber", b."expiryDate",
               b.quantity AS "batchQty",
               p."name",
               COALESCE(i.quantity, 0) AS "quantity"
        FROM "Batch" b
        JOIN "Product" p ON p."id" = b."productId"
        LEFT JOIN "Inventory" i ON i."productId" = p."id"
        WHERE p."status" = 'ACTIVE'
          AND b."expiryDate" IS NOT NULL
          AND b.quantity > 0
          AND b."expiryDate" >= ${now.toISOString()}
          AND b."expiryDate" <= ${in14Days.toISOString()}
        ORDER BY b."expiryDate" ASC
        LIMIT ${limit}
      `
      return rows.map((r) => ({
        productId: String(r.productId),
        productName: r.name as string,
        expiryDate: r.expiryDate as string,
        quantity: Number(r.quantity),
        batchQty: Number(r.batchQty),
        batchNumber: r.batchNumber as string,
        batchId: r.batchId,
        daysToExpiry: daysUntilExpiry(r.expiryDate as string),
      }))
    }

    const fetchReorder = async () => {
      const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT p."id", p."name",
               i."quantity", p."reorderPoint", p."reorderQty"
        FROM "Product" p JOIN "Inventory" i ON i."productId" = p."id"
        WHERE p."status" = 'ACTIVE' AND i."quantity" <= p."reorderPoint"
        ORDER BY i."quantity" ASC
        LIMIT ${limit}
      `
      return rows.map((r) => ({
        productId: r.id as string,
        productName: r.name as string,
        quantity: Number(r.quantity),
        reorderPoint: Number(r.reorderPoint),
        reorderQty: Number(r.reorderQty),
      }))
    }

    if (alertType === 'expiringSoon') {
      const items = await fetchExpiring()
      return NextResponse.json({ items })
    }
    if (alertType === 'belowReorder') {
      const items = await fetchReorder()
      return NextResponse.json({ items })
    }

    const [expiringSoon, belowReorder] = await Promise.all([fetchExpiring(), fetchReorder()])
    return NextResponse.json({ expiringSoon, belowReorder })
  } catch (error) {
    console.error('Error fetching alerts:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch alerts', detail: msg }, { status: 500 })
  }
}
