import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, generateBatchNo, sqlRaw } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

/**
 * GET  /api/inventory/batches?productId=xxx                      — list batches for a product
 * GET  /api/inventory/batches?action=search&q=BN-xxxx           — search batches by batch# or expiry
 * POST /api/inventory/batches                                   — receive new stock as a batch
 */

// ---------- GET ----------
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // ---- Batch lookup by batch number or expiry date ----
    if (action === 'search') {
      const q = (searchParams.get('q') || '').trim()
      if (!q) return NextResponse.json({ batches: [] })
      if (!isTurso()) return NextResponse.json({ batches: [] })

      // Detect if query looks like a date (YYYY-MM-DD)
      const isDate = /^\d{4}-\d{2}-\d{2}$/.test(q)

      let sql: string

      if (isDate) {
        // Search by expiry date (exact match)
        sql = `SELECT b.id, b."productId", b."batchNumber", b."expiryDate",
                       b.quantity, b."costPrice", b."receivedAt",
                       p.name as "productName", p.ndc
                FROM "Batch" b
                LEFT JOIN "Product" p ON p.id = b."productId"
                WHERE date(b."expiryDate") = date('${q.replace(/'/g, "''")}')
                ORDER BY p.name ASC, b."expiryDate" ASC`
      } else {
        // Search by batch number (partial, case-insensitive)
        const safeQ = q.toLowerCase().replace(/'/g, "''")
        sql = `SELECT b.id, b."productId", b."batchNumber", b."expiryDate",
                       b.quantity, b."costPrice", b."receivedAt",
                       p.name as "productName", p.ndc
                FROM "Batch" b
                LEFT JOIN "Product" p ON p.id = b."productId"
                WHERE LOWER(b."batchNumber") LIKE '%${safeQ}%'
                ORDER BY p.name ASC, b."expiryDate" ASC`
      }

      const result = await turso.execute(sql)
      const batches = result.rows.map((row: any) => ({
        id: row.id,
        productId: row.productId,
        batchNumber: row.batchNumber,
        expiryDate: row.expiryDate,
        quantity: Number(row.quantity) || 0,
        costPrice: row.costPrice != null ? Number(row.costPrice) : null,
        receivedAt: row.receivedAt,
        productName: row.productName,
        ndc: row.ndc,
      }))
      return NextResponse.json({ batches })
    }

    // ---- List batches for a specific product ----
    const productId = searchParams.get('productId')
    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }

    if (isTurso()) {
      const safePid = productId.replace(/'/g, "''")

      // Inline backfill: update any NULL expiryDate batches from their Product.expiryDate
      await turso.execute(
        `UPDATE "Batch"
         SET "expiryDate" = (SELECT p."expiryDate" FROM "Product" p WHERE p.id = "Batch"."productId"),
             "updatedAt" = '${new Date().toISOString()}'
         WHERE "productId" = '${safePid}'
           AND "expiryDate" IS NULL
           AND (SELECT p."expiryDate" FROM "Product" p WHERE p.id = "Batch"."productId") IS NOT NULL`
      )

      const result = await turso.execute(
        `SELECT b.id, b."productId", b."batchNumber", b."expiryDate",
                       b.quantity, b."costPrice", b."receivedAt", b."receivedBy",
                       b."createdAt", b."updatedAt",
                       p.name as "productName", p.ndc
                FROM "Batch" b
                LEFT JOIN "Product" p ON p.id = b."productId"
                WHERE b."productId" = '${safePid}'
                ORDER BY b."expiryDate" ASC NULLS LAST, b."receivedAt" ASC`
      )
      const batches = result.rows.map((row: any) => ({
        id: row.id,
        productId: row.productId,
        batchNumber: row.batchNumber,
        expiryDate: row.expiryDate,
        quantity: Number(row.quantity) || 0,
        costPrice: row.costPrice != null ? Number(row.costPrice) : null,
        receivedAt: row.receivedAt,
        receivedBy: row.receivedBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        productName: row.productName,
        ndc: row.ndc,
      }))
      return NextResponse.json({ batches })
    }

    // Prisma fallback — no batch table locally, return empty
    return NextResponse.json({ batches: [] })
  } catch (error) {
    console.error('Error fetching batches:', error)
    return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 })
  }
}

// ---------- POST — Receive new stock as a batch ----------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, batchNumber, expiryDate, quantity, costPrice, reason } = body
    const receivedBy = request.headers.get('x-user-id') || ''

    if (!productId || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'productId and a positive quantity are required' }, { status: 400 })
    }

    if (isTurso()) {
      const now = new Date().toISOString()
      const batchId = generateId()
      const autoBatchNumber = batchNumber || generateBatchNo()
      const safePid = productId.replace(/'/g, "''")
      const safeBN = autoBatchNumber.replace(/'/g, "''")
      const safeExp = expiryDate ? "'" + expiryDate.replace(/'/g, "''") + "'" : 'NULL'
      const safeCost = costPrice != null ? String(costPrice) : 'NULL'
      const safeRB = receivedBy.replace(/'/g, "''")

      // Insert the batch
      await turso.execute(
        `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "receivedBy", "createdAt", "updatedAt")
         VALUES ('${batchId}', '${safePid}', '${safeBN}', ${safeExp}, ${quantity}, ${safeCost}, '${now}', '${safeRB}', '${now}', '${now}')`
      )

      // Update Inventory total quantity (additive)
      const invResult = await turso.execute(
        `SELECT quantity FROM Inventory WHERE "productId" = '${safePid}'`
      )
      const currentQty = invResult.rows.length > 0 ? Number(invResult.rows[0].quantity) : 0
      const newQty = currentQty + quantity

      if (invResult.rows.length > 0) {
        await turso.execute(
          `UPDATE Inventory SET quantity = ${newQty}, "lastCounted" = '${now}', "updatedAt" = '${now}' WHERE "productId" = '${safePid}'`
        )
      } else {
        const invId = generateId()
        await turso.execute(
          `INSERT INTO Inventory (id, "productId", quantity, "lastCounted", "createdAt", "updatedAt") VALUES ('${invId}', '${safePid}', ${newQty}, '${now}', '${now}', '${now}')`
        )
      }

      // Update Product expiryDate to nearest ACTIVE (non-expired) batch expiry
      await turso.execute(
        `UPDATE "Product" SET "expiryDate" = (
                SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = '${safePid}' AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
              ), "updatedAt" = '${now}'
              WHERE id = '${safePid}'`
      )

      // Audit log
      const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({ userId: auditUserId, action: 'BATCH_RECEIVED', category: 'inventory', entity: 'Batch', entityId: batchId, details: { productId, batchNumber: autoBatchNumber, quantity, costPrice }, ipAddress, userAgent })

      return NextResponse.json({
        id: batchId,
        productId,
        batchNumber: autoBatchNumber,
        expiryDate: expiryDate || null,
        quantity,
        costPrice: costPrice || null,
        receivedAt: now,
        totalStock: newQty,
        message: `Received ${quantity} units (batch: ${autoBatchNumber})`,
      }, { status: 201 })
    }

    return NextResponse.json({ error: 'Batch tracking requires Turso database' }, { status: 400 })
  } catch (error) {
    console.error('Error creating batch:', error)
    return NextResponse.json({ error: 'Failed to receive stock batch' }, { status: 500 })
  }
}
