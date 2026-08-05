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
    const { quantity, expiryDate, reason } = body
    const userId = request.headers.get('x-user-id') || ''

    if (quantity === undefined && expiryDate === undefined) {
      return NextResponse.json({ error: 'quantity or expiryDate is required' }, { status: 400 })
    }

    if (!isTurso()) {
      return NextResponse.json({ error: 'Batch tracking requires Turso database' }, { status: 400 })
    }

    const now = new Date().toISOString()

    // Fetch current batch
    const batchResult = await turso.execute({
      sql: `SELECT b.id, b."productId", b."batchNumber", b."expiryDate", b.quantity, b."costPrice",
                     p.name as "productName"
              FROM "Batch" b
              LEFT JOIN "Product" p ON p.id = b."productId"
              WHERE b.id = ?`,
      args: [batchId],
    })
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
    const setClauses: string[] = ['"updatedAt" = ?']
    const setArgs: unknown[] = [now]

    if (quantity !== undefined) {
      setClauses.push('quantity = ?')
      setArgs.push(newQty)
    }
    if (expiryDate !== undefined) {
      setClauses.push('"expiryDate" = ?')
      setArgs.push(expiryDate || null)
    }
    setArgs.push(batchId)

    await turso.execute({
      sql: `UPDATE "Batch" SET ${setClauses.join(', ')} WHERE id = ?`,
      args: setArgs,
    })

    // Recalculate Inventory total quantity
    const sumResult = await turso.execute({
      sql: `SELECT COALESCE(SUM(quantity), 0) as total FROM "Batch" WHERE "productId" = ?`,
      args: [batch.productId],
    })
    const totalBatchQty = Number(sumResult.rows[0][0]) || 0

    await turso.execute({
      sql: 'UPDATE Inventory SET quantity = ?, updatedAt = ? WHERE "productId" = ?',
      args: [totalBatchQty, now, batch.productId],
    })

    // Update Product expiryDate to nearest ACTIVE (non-expired) batch expiry
    await turso.execute({
      sql: `UPDATE "Product" SET "expiryDate" = (
              SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
            ), "updatedAt" = ?
            WHERE id = ?`,
      args: [batch.productId, now, batch.productId],
    })

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
      batchNumber: batch.batchNumber,
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

    // Fetch batch details before deletion
    const batchResult = await turso.execute({
      sql: `SELECT id, "productId", "batchNumber", quantity FROM "Batch" WHERE id = ?`,
      args: [batchId],
    })
    if (batchResult.rows.length === 0) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }
    const batch = batchResult.rows[0] as any
    const batchQty = Number(batch.quantity) || 0

    // Delete the batch
    await turso.execute({ sql: 'DELETE FROM "Batch" WHERE id = ?', args: [batchId] })

    // Recalculate Inventory total
    const sumResult = await turso.execute({
      sql: `SELECT COALESCE(SUM(quantity), 0) as total FROM "Batch" WHERE "productId" = ?`,
      args: [batch.productId],
    })
    const totalBatchQty = Number(sumResult.rows[0][0]) || 0

    await turso.execute({
      sql: 'UPDATE Inventory SET quantity = ?, updatedAt = ? WHERE "productId" = ?',
      args: [totalBatchQty, now, batch.productId],
    })

    // Update Product expiryDate to nearest ACTIVE (non-expired) batch expiry
    await turso.execute({
      sql: `UPDATE "Product" SET "expiryDate" = (
              SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
            ), "updatedAt" = ?
            WHERE id = ?`,
      args: [batch.productId, now, batch.productId],
    })

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
