import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

function toObjs(result: { columns: Array<string>; rows: Array<Array<unknown>> | Array<Record<string, unknown>> }) {
  const names = result.columns.map((c) => c)
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((n, i) => { obj[n] = row[i] })
    return obj
  })
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) return NextResponse.json({ error: 'Auth required' }, { status: 401 })

    if (!isTurso()) return NextResponse.json({ error: 'Only Turso' }, { status: 400 })

    const debug: Record<string, unknown> = {}

    // 1. Total counts
    const counts = await turso.execute(`
      SELECT
        (SELECT count(*) FROM Product) as totalProducts,
        (SELECT count(*) FROM Product WHERE status = 'ACTIVE') as activeProducts,
        (SELECT count(*) FROM Product WHERE status = 'active') as activeLower,
        (SELECT count(*) FROM Inventory) as totalInventory,
        (SELECT count(*) FROM Batch) as totalBatches,
        (SELECT count(*) FROM Batch WHERE quantity > 0) as activeBatches
    `)
    debug.counts = toObjs(counts)[0]

    // 2. Reorder candidates - no status filter
    const reorderAll = await turso.execute(`
      SELECT p.name, p.status, i."quantity", p."reorderPoint"
      FROM Product p JOIN Inventory i ON i."productId" = p.id
      WHERE i."quantity" <= p."reorderPoint"
      LIMIT 10
    `)
    debug.reorderCandidatesAll = toObjs(reorderAll)

    // 3. Reorder with ACTIVE filter
    const reorderActive = await turso.execute(`
      SELECT p.name, p.status, i."quantity", p."reorderPoint"
      FROM Product p JOIN Inventory i ON i."productId" = p.id
      WHERE p.status = 'ACTIVE' AND i."quantity" <= p."reorderPoint"
      LIMIT 10
    `)
    debug.reorderCandidatesActive = toObjs(reorderActive)

    // 4. Batches with expiry dates
    const batchExpiry = await turso.execute(`
      SELECT b."batchNumber", b."expiryDate", b.quantity, p.name,
             date(b."expiryDate") as parsedDate,
             date('now') as today,
             date('now', '+14 days') as in14days
      FROM Batch b JOIN Product p ON p.id = b."productId"
      WHERE b."expiryDate" IS NOT NULL AND b."expiryDate" != ''
      LIMIT 10
    `)
    debug.batchExpirySamples = toObjs(batchExpiry)

    // 5. Product expiry dates
    const prodExpiry = await turso.execute(`
      SELECT name, "expiryDate", status, date("expiryDate") as parsedDate
      FROM Product
      WHERE "expiryDate" IS NOT NULL AND "expiryDate" != ''
      LIMIT 10
    `)
    debug.productExpirySamples = toObjs(prodExpiry)

    // 6. Ibuprofen products
    const ibuprofen = await turso.execute(`
      SELECT p.name, p.status, p."expiryDate", i."quantity", p."reorderPoint"
      FROM Product p LEFT JOIN Inventory i ON i."productId" = p.id
      WHERE p.name LIKE '%Ibuprofen%'
      LIMIT 5
    `)
    debug.ibuprofenProducts = toObjs(ibuprofen)

    // 7. Ferroglo products
    const ferroglo = await turso.execute(`
      SELECT p.name, p.status, i."quantity", p."reorderPoint"
      FROM Product p LEFT JOIN Inventory i ON i."productId" = p.id
      WHERE p.name LIKE '%Ferroglo%'
      LIMIT 5
    `)
    debug.ferrogloProducts = toObjs(ferroglo)

    // 8. Ibuprofen batches
    const ibuBatches = await turso.execute(`
      SELECT b."batchNumber", b."expiryDate", b.quantity, p.name
      FROM Batch b JOIN Product p ON p.id = b."productId"
      WHERE p.name LIKE '%Ibuprofen%'
      LIMIT 5
    `)
    debug.ibuprofenBatches = toObjs(ibuBatches)

    // 9. Distinct status values
    const statuses = await turso.execute(`SELECT DISTINCT status FROM Product`)
    debug.distinctStatuses = toObjs(statuses).map(r => r.status)

    return NextResponse.json(debug)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
