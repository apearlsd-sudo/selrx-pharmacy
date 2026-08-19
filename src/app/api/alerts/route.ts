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

// ---------------------------------------------------------------------------
// GET /api/alerts
// Returns alerts: batches expiring within 2 weeks + stock at/below reorder
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (isTurso()) {
      const [expiringResult, reorderResult] = await Promise.all([
        // Batches expiring within 14 days (2 weeks) with stock > 0
        turso.execute({
          sql: `SELECT b.id AS "batchId", b."productId", b."batchNumber", b."expiryDate",
                 b.quantity AS "batchQty",
                 p."id", p."name", p."ndc", p."category", p."sellingPrice",
                 COALESCE(i."quantity", 0) AS "quantity", p."storageLocation"
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
          LIMIT 50`,
          args: [],
        }),

        // Products at or below reorder point
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
        id: String(r.productId),
        batchId: r.batchId,
        name: r.name,
        ndc: r.ndc,
        category: r.category,
        sellingPrice: r.sellingPrice,
        quantity: r.quantity,
        batchQty: r.batchQty,
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

    // Prisma fallback — also uses raw SQL for Batch table
    const { db } = await import('@/lib/db')
    const now = new Date()
    const in14Days = new Date(now)
    in14Days.setDate(in14Days.getDate() + 14)

    const [expiringBatches, reorderProducts] = await Promise.all([
      // Query Batch table for expiry within 14 days
      db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT b.id AS "batchId", b."productId", b."batchNumber", b."expiryDate",
               b.quantity AS "batchQty",
               p."id", p."name", p."ndc", p."category", p."sellingPrice",
               COALESCE(i.quantity, 0) AS "quantity", p."storageLocation"
        FROM "Batch" b
        JOIN "Product" p ON p."id" = b."productId"
        LEFT JOIN "Inventory" i ON i."productId" = p."id"
        WHERE p."status" = 'ACTIVE'
          AND b."expiryDate" IS NOT NULL
          AND b.quantity > 0
          AND b."expiryDate" >= ${now.toISOString()}
          AND b."expiryDate" <= ${in14Days.toISOString()}
        ORDER BY b."expiryDate" ASC
        LIMIT 50
      `,

      db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT p."id", p."name", p."ndc", p."category", p."sellingPrice", p."costPrice",
               i."quantity", p."reorderPoint", p."reorderQty", p."storageLocation"
        FROM "Product" p JOIN "Inventory" i ON i."productId" = p."id"
        WHERE p."status" = 'ACTIVE' AND i."quantity" <= p."reorderPoint"
        ORDER BY i."quantity" ASC
        LIMIT 50
      `,
    ])

    const expiringSoon = expiringBatches.map((r) => ({
      id: String(r.productId),
      batchId: r.batchId,
      name: r.name as string,
      ndc: r.ndc as string,
      category: r.category as string,
      sellingPrice: Number(r.sellingPrice),
      quantity: Number(r.quantity),
      batchQty: Number(r.batchQty),
      expiryDate: r.expiryDate as string,
      batchNumber: r.batchNumber as string,
      storageLocation: r.storageLocation as string,
    }))

    const belowReorder = reorderProducts.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      ndc: r.ndc as string,
      category: r.category as string,
      sellingPrice: Number(r.sellingPrice),
      costPrice: Number(r.costPrice),
      quantity: Number(r.quantity),
      reorderPoint: Number(r.reorderPoint),
      reorderQty: Number(r.reorderQty),
      storageLocation: r.storageLocation as string,
    }))

    return NextResponse.json({ expiringSoon, belowReorder })
  } catch (error) {
    console.error('Error fetching alerts:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch alerts', detail: msg }, { status: 500 })
  }
}
