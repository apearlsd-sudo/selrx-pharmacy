import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExpiringAlertItem {
  productId: string
  productName: string
  expiryDate: string
  quantity: number
  batchQty: number
  batchNumber: string | null
  batchId: string
  daysToExpiry: number
}

interface ReorderAlertItem {
  productId: string
  productName: string
  quantity: number
  reorderPoint: number
  reorderQty: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toObjs(result: { columns: Array<string>; rows: Array<Array<unknown>> | Array<Record<string, unknown>> }) {
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

function mapRowToExpiring(r: Record<string, unknown>): ExpiringAlertItem {
  return {
    productId: String(r.productId ?? r.id ?? ''),
    productName: (r.name ?? '') as string,
    expiryDate: (r.expiryDate ?? '') as string,
    quantity: Number(r.quantity ?? 0),
    batchQty: Number(r.batchQty ?? r.quantity ?? 0),
    batchNumber: r.batchNumber != null ? String(r.batchNumber) : null,
    batchId: r.batchId != null ? String(r.batchId) : '',
    daysToExpiry: daysUntilExpiry((r.expiryDate ?? '') as string),
  }
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
    const alertType = searchParams.get('type')
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 50)

    // ── Turso path ──────────────────────────────────────────────────────────
    if (isTurso()) {
      // Fetch batches expiring within 14 days
      // Uses plain turso.execute(sql) — NOT the { sql, args } object form —
      // because the parameterized form was returning 0 rows despite data existing.
      const fetchExpiringFromBatch = async (): Promise<ExpiringAlertItem[]> => {
        try {
          const result = await turso.execute(
            `SELECT b.id AS batchId, b.productId, b.batchNumber, b.expiryDate,
                    b.quantity AS batchQty,
                    p.name,
                    COALESCE(i.quantity, 0) AS quantity
             FROM Batch b
             JOIN Product p ON p.id = b.productId
             LEFT JOIN Inventory i ON i.productId = p.id
             WHERE p.status = 'ACTIVE'
               AND b.expiryDate IS NOT NULL
               AND b.expiryDate != ''
               AND b.quantity > 0
               AND date(b.expiryDate) >= date('now')
               AND date(b.expiryDate) <= date('now', '+14 days')
             ORDER BY date(b.expiryDate) ASC
             LIMIT ${limit}`
          )
          const rows = toObjs(result)
          console.log('[alerts] Batch expiry query returned', rows.length, 'rows')
          return rows.map(mapRowToExpiring)
        } catch (err) {
          console.error('[alerts] fetchExpiringFromBatch error:', err)
          return []
        }
      }

      // Fetch products with expiry dates within 14 days (fallback / supplement)
      const fetchExpiringFromProduct = async (): Promise<ExpiringAlertItem[]> => {
        try {
          const result = await turso.execute(
            `SELECT p.id, p.name, p.expiryDate,
                    COALESCE(i.quantity, 0) AS quantity
             FROM Product p
             LEFT JOIN Inventory i ON i.productId = p.id
             WHERE p.status = 'ACTIVE'
               AND p.expiryDate IS NOT NULL
               AND p.expiryDate != ''
               AND date(p.expiryDate) >= date('now')
               AND date(p.expiryDate) <= date('now', '+14 days')
               AND COALESCE(i.quantity, 0) > 0
             ORDER BY date(p.expiryDate) ASC
             LIMIT ${limit}`
          )
          const rows = toObjs(result)
          console.log('[alerts] Product expiry query returned', rows.length, 'rows')
          return rows.map(mapRowToExpiring)
        } catch (err) {
          console.error('[alerts] fetchExpiringFromProduct error:', err)
          return []
        }
      }

      // Fetch products at or below reorder point
      // Includes EXPIRED status — products with stock below reorder need attention
      // regardless of their expiry status
      const fetchReorder = async (): Promise<ReorderAlertItem[]> => {
        try {
          const result = await turso.execute(
            `SELECT p.id, p.name,
                    i.quantity, p.reorderPoint, p.reorderQty
             FROM Product p
             JOIN Inventory i ON i.productId = p.id
             WHERE p.status IN ('ACTIVE', 'EXPIRED')
               AND i.quantity <= p.reorderPoint
             ORDER BY i.quantity ASC
             LIMIT ${limit}`
          )
          const rows = toObjs(result)
          console.log('[alerts] Reorder query returned', rows.length, 'rows')
          return rows.map((r) => ({
            productId: r.id as string,
            productName: r.name as string,
            quantity: Number(r.quantity),
            reorderPoint: Number(r.reorderPoint),
            reorderQty: Number(r.reorderQty),
          }))
        } catch (err) {
          console.error('[alerts] fetchReorder error:', err)
          return []
        }
      }

      if (alertType === 'expiringSoon') {
        // Run both batch and product queries in parallel, merge & deduplicate
        const [batchItems, productItems] = await Promise.all([
          fetchExpiringFromBatch(),
          fetchExpiringFromProduct(),
        ])
        const seen = new Set<string>()
        const items: ExpiringAlertItem[] = []
        for (const item of [...batchItems, ...productItems]) {
          const key = `${item.productId}:${item.expiryDate}`
          if (!seen.has(key)) {
            seen.add(key)
            items.push(item)
          }
        }
        items.sort((a, b) => a.daysToExpiry - b.daysToExpiry)
        return NextResponse.json({ items: items.slice(0, limit) })
      }

      if (alertType === 'belowReorder') {
        const items = await fetchReorder()
        return NextResponse.json({ items })
      }

      // No type specified — return both
      const [batchItems, productItems, belowReorder] = await Promise.all([
        fetchExpiringFromBatch(),
        fetchExpiringFromProduct(),
        fetchReorder(),
      ])

      // Merge & deduplicate expiring items
      const seen = new Set<string>()
      const expiringSoon: ExpiringAlertItem[] = []
      for (const item of [...batchItems, ...productItems]) {
        const key = `${item.productId}:${item.expiryDate}`
        if (!seen.has(key)) {
          seen.add(key)
          expiringSoon.push(item)
        }
      }
      expiringSoon.sort((a, b) => a.daysToExpiry - b.daysToExpiry)

      return NextResponse.json({
        expiringSoon: expiringSoon.slice(0, limit),
        belowReorder,
      })
    }

    // ── Prisma fallback ────────────────────────────────────────────────────
    const { db } = await import('@/lib/db')
    const now = new Date()
    const in14Days = new Date(now)
    in14Days.setDate(in14Days.getDate() + 14)

    const fetchExpiring = async (): Promise<ExpiringAlertItem[]> => {
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
      return rows.map(mapRowToExpiring)
    }

    const fetchExpiringFromProduct = async (): Promise<ExpiringAlertItem[]> => {
      const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT p."id", p."name", p."expiryDate",
               COALESCE(i.quantity, 0) AS "quantity"
        FROM "Product" p
        LEFT JOIN "Inventory" i ON i."productId" = p."id"
        WHERE p."status" = 'ACTIVE'
          AND p."expiryDate" IS NOT NULL
          AND p."expiryDate" != ''
          AND p."expiryDate" >= ${now.toISOString()}
          AND p."expiryDate" <= ${in14Days.toISOString()}
          AND COALESCE(i.quantity, 0) > 0
        ORDER BY p."expiryDate" ASC
        LIMIT ${limit}
      `
      return rows.map(mapRowToExpiring)
    }

    const fetchReorder = async () => {
      const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT p."id", p."name",
               i."quantity", p."reorderPoint", p."reorderQty"
        FROM "Product" p JOIN "Inventory" i ON i."productId" = p."id"
        WHERE p."status" IN ('ACTIVE', 'EXPIRED')
          AND i."quantity" <= p."reorderPoint"
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
      const [batchItems, productItems] = await Promise.all([fetchExpiring(), fetchExpiringFromProduct()])
      const seen = new Set<string>()
      const items: ExpiringAlertItem[] = []
      for (const item of [...batchItems, ...productItems]) {
        const key = `${item.productId}:${item.expiryDate}`
        if (!seen.has(key)) { seen.add(key); items.push(item) }
      }
      items.sort((a, b) => a.daysToExpiry - b.daysToExpiry)
      return NextResponse.json({ items: items.slice(0, limit) })
    }
    if (alertType === 'belowReorder') {
      const items = await fetchReorder()
      return NextResponse.json({ items })
    }

    const [batchItems, productItems, belowReorder] = await Promise.all([
      fetchExpiring(), fetchExpiringFromProduct(), fetchReorder(),
    ])
    const seen = new Set<string>()
    const expiringSoon: ExpiringAlertItem[] = []
    for (const item of [...batchItems, ...productItems]) {
      const key = `${item.productId}:${item.expiryDate}`
      if (!seen.has(key)) { seen.add(key); expiringSoon.push(item) }
    }
    expiringSoon.sort((a, b) => a.daysToExpiry - b.daysToExpiry)
    return NextResponse.json({ expiringSoon: expiringSoon.slice(0, limit), belowReorder })
  } catch (error) {
    console.error('Error fetching alerts:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch alerts', detail: msg }, { status: 500 })
  }
}
