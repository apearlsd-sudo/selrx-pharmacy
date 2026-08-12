import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, generateBatchNo } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'
import { writeProductHistory } from '@/lib/product-history'
import { ensurePOTables } from '@/lib/ensure-po-tables'

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
// POST /api/purchase-orders/[id]/receive — receive stock against a PO
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { items } = body as {
      items: Array<{
        orderItemId: string
        quantityReceived: number
        batchNumber?: string
        expiryDate?: string
        costPrice?: number
      }>
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items array is required' }, { status: 400 })
    }

    for (const item of items) {
      if (!item.orderItemId || !item.quantityReceived || item.quantityReceived <= 0) {
        return NextResponse.json({ error: 'Each item must have orderItemId and quantityReceived > 0' }, { status: 400 })
      }
    }

    const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(req)
    const now = new Date().toISOString()
    if (isTurso()) await ensurePOTables()

    if (isTurso()) {
      // Verify PO exists and is not cancelled
      const poResult = await turso.execute({
        sql: `SELECT id, status FROM "PurchaseOrder" WHERE id = ?`,
        args: [id],
      })
      if (poResult.rows.length === 0) {
        return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
      }
      const poStatus = poResult.rows[0].status as string
      if (poStatus === 'CANCELLED') {
        return NextResponse.json({ error: `Cannot receive against a cancelled PO` }, { status: 400 })
      }

      let totalReceivedAmount = 0

      for (const item of items) {
        // Fetch the order item
        const oiResult = await turso.execute({
          sql: `SELECT * FROM "PurchaseOrderItem" WHERE id = ? AND "orderId" = ?`,
          args: [item.orderItemId, id],
        })
        if (oiResult.rows.length === 0) {
          return NextResponse.json({ error: `Order item ${item.orderItemId} not found` }, { status: 404 })
        }
        const orderItem = toObjs(oiResult)[0]
        const orderedQty = Number(orderItem.quantity)
        const currentReceived = Number(orderItem.receivedQty)
        const newReceived = currentReceived + Number(item.quantityReceived)

        if (newReceived > orderedQty) {
          return NextResponse.json(
            { error: `Cannot receive more than ordered quantity for ${orderItem.productName}. Ordered: ${orderedQty}, Already received: ${currentReceived}, Attempting: ${item.quantityReceived}` },
            { status: 400 }
          )
        }

        const costPrice = item.costPrice != null ? Number(item.costPrice) : Number(orderItem.unitCost)
        const lineTotal = Number(item.quantityReceived) * costPrice
        totalReceivedAmount += lineTotal

        // 1. Update PurchaseOrderItem.receivedQty
        await turso.execute({
          sql: `UPDATE "PurchaseOrderItem" SET "receivedQty" = ? WHERE id = ?`,
          args: [newReceived, item.orderItemId],
        })

        // 2. Create/update Inventory record (add quantity)
        const invResult = await turso.execute({
          sql: `SELECT id, quantity FROM "Inventory" WHERE "productId" = ?`,
          args: [orderItem.productId as string],
        })
        if (invResult.rows.length > 0) {
          const invRow = toObjs(invResult)[0]
          const newQty = Number(invRow.quantity) + Number(item.quantityReceived)
          await turso.execute({
            sql: `UPDATE "Inventory" SET quantity = ?, "updatedAt" = ? WHERE id = ?`,
            args: [newQty, now, invRow.id],
          })
        } else {
          const invId = generateId()
          await turso.execute({
            sql: `INSERT INTO "Inventory" (id, "productId", quantity, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
            args: [invId, orderItem.productId, Number(item.quantityReceived), now, now],
          })
        }

        // 3. Create Batch record if batchNumber or expiryDate provided
        if (item.batchNumber || item.expiryDate) {
          const batchId = generateId()
          const batchNumber = item.batchNumber || generateBatchNo()
          await turso.execute({
            sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "createdAt", "updatedAt")
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              batchId,
              orderItem.productId,
              batchNumber,
              item.expiryDate || null,
              Number(item.quantityReceived),
              costPrice,
              now,
              now,
              now,
            ],
          })
        }

        // 4. Write product history
        writeProductHistory({
          productId: orderItem.productId as string,
          action: 'UPDATED',
          changedFields: ['inventory'],
          newValues: {
            source: 'PO_RECEIVE',
            quantityReceived: Number(item.quantityReceived),
            costPrice,
            batchNumber: item.batchNumber || null,
            expiryDate: item.expiryDate || null,
            purchaseOrderId: id,
          },
          userId: auditUserId,
        })
      }

      // 5. Check if all order items are fully received
      const allItemsResult = await turso.execute({
        sql: `SELECT quantity, "receivedQty" FROM "PurchaseOrderItem" WHERE "orderId" = ?`,
        args: [id],
      })
      const allItems = toObjs(allItemsResult)
      let allFullyReceived = true
      for (const row of allItems) {
        if (Number(row.receivedQty) < Number(row.quantity)) {
          allFullyReceived = false
          break
        }
      }

      const newStatus = allFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED'

      // Update PO status and receivedAmount
      const currentPO = toObjs(await turso.execute({
        sql: `SELECT "receivedAmount" FROM "PurchaseOrder" WHERE id = ?`,
        args: [id],
      }))[0]
      const newReceivedAmount = Number(currentPO.receivedAmount) + totalReceivedAmount

      await turso.execute({
        sql: `UPDATE "PurchaseOrder" SET status = ?, "receivedAmount" = ?, "updatedAt" = ? WHERE id = ?`,
        args: [newStatus, newReceivedAmount, now, id],
      })

      // 6. Audit log
      await writeAuditLog({
        userId: auditUserId,
        action: allFullyReceived ? 'PO_FULLY_RECEIVED' : 'PO_PARTIALLY_RECEIVED',
        category: 'purchase',
        entity: 'PurchaseOrder',
        entityId: id,
        details: {
          itemsReceived: items.length,
          totalReceivedAmount,
          newStatus,
        },
        ipAddress,
        userAgent,
      })

      return NextResponse.json({
        success: true,
        newStatus,
        receivedAmount: newReceivedAmount,
      })
    }

    // ---- Prisma fallback ----
    const { db } = await import('@/lib/db')
    const po = await db.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }
    if (po.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot receive against a cancelled PO' }, { status: 400 })
    }

    let totalReceivedAmount = 0

    for (const item of items) {
      const orderItem = po.items.find((oi) => oi.id === item.orderItemId)
      if (!orderItem) {
        return NextResponse.json({ error: `Order item ${item.orderItemId} not found` }, { status: 404 })
      }
      const newReceived = orderItem.receivedQty + item.quantityReceived
      if (newReceived > orderItem.quantity) {
        return NextResponse.json({ error: `Cannot receive more than ordered quantity for ${orderItem.productName}` }, { status: 400 })
      }

      const costPrice = item.costPrice != null ? item.costPrice : orderItem.unitCost
      totalReceivedAmount += item.quantityReceived * costPrice

      // Update order item
      await db.purchaseOrderItem.update({
        where: { id: item.orderItemId },
        data: { receivedQty: newReceived },
      })

      // Update or create inventory
      const existing = await db.inventory.findUnique({ where: { productId: orderItem.productId } })
      if (existing) {
        await db.inventory.update({
          where: { id: existing.id },
          data: { quantity: { increment: item.quantityReceived }, updatedAt: new Date() },
        })
      } else {
        await db.inventory.create({
          data: { productId: orderItem.productId, quantity: item.quantityReceived },
        })
      }

      // Create batch if batch info provided
      if (item.batchNumber || item.expiryDate) {
        await db.batch.create({
          data: {
            productId: orderItem.productId,
            batchNumber: item.batchNumber || `BN-${Date.now()}`,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
            quantity: item.quantityReceived,
            costPrice,
            receivedAt: new Date(),
          },
        })
      }

      writeProductHistory({
        productId: orderItem.productId,
        action: 'UPDATED',
        changedFields: ['inventory'],
        newValues: { source: 'PO_RECEIVE', quantityReceived: item.quantityReceived, costPrice },
        userId: auditUserId,
      })
    }

    // Check if all items fully received
    const updatedPO = await db.purchaseOrder.findUnique({ where: { id }, include: { items: true } })
    const allFullyReceived = updatedPO!.items.every((oi) => oi.receivedQty >= oi.quantity)
    const newStatus = allFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED'
    const newReceivedAmount = (updatedPO!.receivedAmount || 0) + totalReceivedAmount

    await db.purchaseOrder.update({
      where: { id },
      data: { status: newStatus, receivedAmount: newReceivedAmount },
    })

    await writeAuditLog({
      userId: auditUserId,
      action: allFullyReceived ? 'PO_FULLY_RECEIVED' : 'PO_PARTIALLY_RECEIVED',
      category: 'purchase', entity: 'PurchaseOrder', entityId: id,
      details: { itemsReceived: items.length, totalReceivedAmount, newStatus },
      ipAddress, userAgent,
    })

    return NextResponse.json({ success: true, newStatus, receivedAmount: newReceivedAmount })
  } catch (error) {
    console.error('POST /api/purchase-orders/[id]/receive error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to receive stock', detail: msg }, { status: 500 })
  }
}
