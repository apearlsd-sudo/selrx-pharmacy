import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, generateBatchNo } from '@/lib/turso'

/**
 * GET  /api/inventory/batches?productId=xxx  — list batches for a product
 * POST /api/inventory/batches                   — receive new stock as a batch
 */

// ---------- GET ----------
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }

    if (isTurso()) {
      // Inline backfill: update any NULL expiryDate batches from their Product.expiryDate
      // This ensures expiry dates always show even if the batch was created without one
      await turso.execute({
        sql: `UPDATE "Batch"
              SET "expiryDate" = (SELECT p."expiryDate" FROM "Product" p WHERE p.id = "Batch"."productId"),
                  "updatedAt" = ?
              WHERE "productId" = ?
                AND "expiryDate" IS NULL
                AND (SELECT p."expiryDate" FROM "Product" p WHERE p.id = "Batch"."productId") IS NOT NULL`,
        args: [new Date().toISOString(), productId],
      })

      const result = await turso.execute({
        sql: `SELECT b.id, b."productId", b."batchNumber", b."expiryDate",
                       b.quantity, b."costPrice", b."receivedAt", b."receivedBy",
                       b."createdAt", b."updatedAt",
                       p.name as "productName", p.ndc
                FROM "Batch" b
                LEFT JOIN "Product" p ON p.id = b."productId"
                WHERE b."productId" = ?
                ORDER BY b."expiryDate" ASC NULLS LAST, b."receivedAt" ASC`,
        args: [productId],
      })
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

      // Insert the batch
      await turso.execute({
        sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "receivedBy", "createdAt", "updatedAt")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [batchId, productId, autoBatchNumber, expiryDate || null, quantity, costPrice || null, now, receivedBy, now, now],
      })

      // Update Inventory total quantity (additive)
      const invResult = await turso.execute({
        sql: 'SELECT quantity FROM Inventory WHERE productId = ?',
        args: [productId],
      })
      const currentQty = invResult.rows.length > 0 ? (invResult.rows[0][0] as number) : 0
      const newQty = currentQty + quantity

      if (invResult.rows.length > 0) {
        await turso.execute({
          sql: 'UPDATE Inventory SET quantity = ?, lastCounted = ?, updatedAt = ? WHERE productId = ?',
          args: [newQty, now, now, productId],
        })
      } else {
        const invId = generateId()
        await turso.execute({
          sql: `INSERT INTO Inventory (id, "productId", quantity, "lastCounted", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)`,
          args: [invId, productId, newQty, now, now, now],
        })
      }

      // Update Product expiryDate to nearest ACTIVE (non-expired) batch expiry
      await turso.execute({
        sql: `UPDATE "Product" SET "expiryDate" = (
                SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
              ), "updatedAt" = ?
              WHERE id = ?`,
        args: [productId, now, productId],
      })

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
