import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'
import { writeProductHistory } from '@/lib/product-history'

/**
 * PUT  /api/inventory/batches/[batchId] — adjust batch quantity/expiry
 * DELETE /api/inventory/batches/[batchId] — remove a batch
 */

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    const body = await request.json()
    const { quantity, expiryDate, costPrice, batchNumber, reason } = body
    const userId = request.headers.get('x-user-id') || ''

    if (quantity === undefined && expiryDate === undefined && costPrice === undefined && batchNumber === undefined) {
      return NextResponse.json({ error: 'quantity, expiryDate, costPrice, or batchNumber is required' }, { status: 400 })
    }

    if (!isTurso()) {
      return NextResponse.json({ error: 'Batch tracking requires Turso database' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const safeId = batchId.replace(/'/g, "''")

    // Fetch current batch
    const batchResult = await turso.execute(
      `SELECT b.id, b."productId", b."batchNumber", b."expiryDate", b.quantity, b."costPrice",
                     p.name as "productName"
              FROM "Batch" b
              LEFT JOIN "Product" p ON p.id = b."productId"
              WHERE b.id = '${safeId}'`
    )
    if (batchResult.rows.length === 0) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }
    const batch = batchResult.rows[0] as any
    const prevQty = Number(batch.quantity) || 0
    const newQty = quantity !== undefined ? quantity : prevQty

    if (newQty < 0) {
      return NextResponse.json({ error: 'Batch quantity cannot be negative' }, { status: 400 })
    }

    // Update the batch
    const setClauses: string[] = [`"updatedAt" = '${now}'`]

    if (quantity !== undefined) {
      setClauses.push(`quantity = ${newQty}`)
    }
    if (expiryDate !== undefined) {
      setClauses.push(`"expiryDate" = ${expiryDate ? "'" + expiryDate.replace(/'/g, "''") + "'" : 'NULL'}`)
    }
    if (costPrice !== undefined) {
      setClauses.push(`"costPrice" = ${costPrice}`)
    }
    if (batchNumber !== undefined) {
      setClauses.push(`"batchNumber" = ${batchNumber ? "'" + batchNumber.replace(/'/g, "''") + "'" : 'NULL'}`)
    }

    await turso.execute(
      `UPDATE "Batch" SET ${setClauses.join(', ')} WHERE id = '${safeId}'`
    )

    // Recalculate Inventory total quantity
    const safePid = (batch.productId as string).replace(/'/g, "''")
    const sumResult = await turso.execute(
      `SELECT COALESCE(SUM(quantity), 0) as total FROM "Batch" WHERE "productId" = '${safePid}'`
    )
    const totalBatchQty = Number(sumResult.rows[0].total) || 0

    if (quantity !== undefined) {
      await turso.execute(
        `UPDATE Inventory SET quantity = ${totalBatchQty}, "updatedAt" = '${now}' WHERE "productId" = '${safePid}'`
      )
    }

    // Update Product expiryDate when expiry changed
    if (expiryDate !== undefined) {
      await turso.execute(
        `UPDATE "Product" SET "expiryDate" = (
                SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = '${safePid}' AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
              ), "updatedAt" = '${now}'
              WHERE id = '${safePid}'`
      )
    }

    // Log in product history
    const changedFields: string[] = []
    const previousValues: Record<string, unknown> = {}
    const newValues: Record<string, unknown> = {}
    if (quantity !== undefined && prevQty !== newQty) {
      changedFields.push('batchQuantity')
      previousValues.batchQuantity = prevQty
      newValues.batchQuantity = newQty
      previousValues.batchNumber = batch.batchNumber
      newValues.batchNumber = batch.batchNumber
    }
    if (expiryDate !== undefined) {
      changedFields.push('batchExpiryDate')
      previousValues.batchExpiryDate = batch.expiryDate
      newValues.batchExpiryDate = expiryDate || null
      previousValues.batchNumber = batch.batchNumber
      newValues.batchNumber = batch.batchNumber
    }
    if (costPrice !== undefined) {
      changedFields.push('batchCostPrice')
      previousValues.batchCostPrice = batch.costPrice
      newValues.batchCostPrice = costPrice
      previousValues.batchNumber = batch.batchNumber
      newValues.batchNumber = batch.batchNumber
    }
    if (batchNumber !== undefined && batch.batchNumber !== (batchNumber || null)) {
      changedFields.push('batchNumber')
      previousValues.batchNumber = batch.batchNumber
      newValues.batchNumber = batchNumber || null
    }
    if (changedFields.length > 0) {
      writeProductHistory({
        productId: batch.productId,
        action: 'UPDATED',
        changedFields,
        previousValues,
        newValues,
        userId,
      })
    }

    return NextResponse.json({
      id: batchId,
      productId: batch.productId,
      productName: batch.productName,
      batchNumber: batchNumber !== undefined ? (batchNumber || null) : batch.batchNumber,
      prevQty,
      newQty,
      expiryDate: expiryDate !== undefined ? (expiryDate || null) : batch.expiryDate,
      totalStock: totalBatchQty,
      message: `Batch ${batch.batchNumber || batchId.slice(0, 8)} updated`,
    })
  } catch (error) {
    console.error('Error updating batch:', error)
    return NextResponse.json({ error: 'Failed to update batch' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    const userId = request.headers.get('x-user-id') || ''

    if (!isTurso()) {
      return NextResponse.json({ error: 'Batch tracking requires Turso database' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const safeId = batchId.replace(/'/g, "''")

    // Fetch batch details before deletion
    const batchResult = await turso.execute(
      `SELECT id, "productId", "batchNumber", quantity FROM "Batch" WHERE id = '${safeId}'`
    )
    if (batchResult.rows.length === 0) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }
    const batch = batchResult.rows[0] as any
    const batchQty = Number(batch.quantity) || 0
    const safePid = (batch.productId as string).replace(/'/g, "''")

    // Delete the batch
    await turso.execute(`DELETE FROM "Batch" WHERE id = '${safeId}'`)

    // Recalculate Inventory total
    const sumResult = await turso.execute(
      `SELECT COALESCE(SUM(quantity), 0) as total FROM "Batch" WHERE "productId" = '${safePid}'`
    )
    const totalBatchQty = Number(sumResult.rows[0].total) || 0

    await turso.execute(
      `UPDATE Inventory SET quantity = ${totalBatchQty}, "updatedAt" = '${now}' WHERE "productId" = '${safePid}'`
    )

    // Update Product expiryDate to nearest ACTIVE (non-expired) batch expiry
    await turso.execute(
      `UPDATE "Product" SET "expiryDate" = (
              SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = '${safePid}' AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
            ), "updatedAt" = '${now}'
            WHERE id = '${safePid}'`
    )

    // Log history
    writeProductHistory({
      productId: batch.productId,
      action: 'UPDATED',
      changedFields: ['batchRemoved'],
      previousValues: { batchNumber: batch.batchNumber, batchQuantity: batchQty },
      newValues: { batchRemoved: true },
      userId,
    })

    return NextResponse.json({
      message: `Batch ${batch.batchNumber || batchId.slice(0, 8)} removed`,
      totalStock: totalBatchQty,
    })
  } catch (error) {
    console.error('Error deleting batch:', error)
    return NextResponse.json({ error: 'Failed to delete batch' }, { status: 500 })
  }
}
