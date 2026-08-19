import { NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// NO AUTH REQUIRED — this route is whitelisted in middleware.ts PUBLIC_PATHS
// Temporary diagnostic endpoint to prove DB data flows through to API responses

function toObjs(result: { columns: string[]; rows: unknown[] }) {
  const names = result.columns
  return result.rows.map((row: any) => {
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < names.length; i++) {
      obj[names[i]] = row[i]
    }
    return obj
  })
}

export async function GET() {
  try {
    const out: Record<string, unknown> = {}
    out.tursoEnabled = isTurso()

    if (!isTurso()) {
      out.error = 'Turso not configured — app is using Prisma fallback'
      return NextResponse.json(out)
    }

    // ── TEST 1: Can we read Batch table at all? ──
    try {
      const r1 = await turso.execute('SELECT count(*) as cnt FROM Batch')
      out.batchCount = toObjs(r1)[0].cnt
    } catch (e: any) {
      out.batchCountError = e.message
    }

    // ── TEST 2: Expiry alerts — the EXACT query from /api/alerts ──
    try {
      const r2 = await turso.execute(
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
         LIMIT 50`
      )
      const rows2 = toObjs(r2)
      out.expiringFromBatch = rows2.length
      out.expiringBatchSample = rows2.slice(0, 5)
    } catch (e: any) {
      out.expiringBatchError = e.message
    }

    // ── TEST 3: Product-level expiry ──
    try {
      const r3 = await turso.execute(
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
         LIMIT 50`
      )
      const rows3 = toObjs(r3)
      out.expiringFromProduct = rows3.length
      out.expiringProductSample = rows3.slice(0, 5)
    } catch (e: any) {
      out.expiringProductError = e.message
    }

    // ── TEST 4: Reorder alerts ──
    try {
      const r4 = await turso.execute(
        `SELECT p.id, p.name, i.quantity, p.reorderPoint, p.reorderQty
         FROM Product p
         JOIN Inventory i ON i.productId = p.id
         WHERE p.status IN ('ACTIVE', 'EXPIRED')
           AND i.quantity <= p.reorderPoint
         ORDER BY i.quantity ASC
         LIMIT 50`
      )
      const rows4 = toObjs(r4)
      out.reorderItems = rows4.length
      out.reorderSample = rows4.slice(0, 5)
    } catch (e: any) {
      out.reorderError = e.message
    }

    // ── TEST 5: Raw date check ──
    try {
      const r5 = await turso.execute("SELECT date('now') as today, date('now', '+14 days') as plus14")
      out.dateCheck = toObjs(r5)[0]
    } catch (e: any) {
      out.dateCheckError = e.message
    }

    // ── TEST 6: What does the Batch table look like without WHERE? ──
    try {
      const r6 = await turso.execute(
        `SELECT b.batchNumber, b.expiryDate, b.quantity, p.name, p.status,
                date(b.expiryDate) as parsedExpiry
         FROM Batch b
         JOIN Product p ON p.id = b.productId
         WHERE b.expiryDate IS NOT NULL AND b.expiryDate != '' AND b.quantity > 0
         ORDER BY date(b.expiryDate) ASC
         LIMIT 10`
      )
      out.allBatchExpiry = toObjs(r6)
    } catch (e: any) {
      out.allBatchExpiryError = e.message
    }

    return NextResponse.json(out)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
