import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, generateBatchNo } from '@/lib/turso'
import { writeProductHistory } from '@/lib/product-history'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toObjs(result: { columns: Array<string>; rows: Array<Array<unknown>> }) {
  const names = result.columns.map((c) => c)
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((n, i) => {
      obj[n] = row[i]
    })
    return obj
  })
}

const bool = (v: unknown): boolean => v === 1 || v === true

/**
 * Shared helper: fetch a single return with full JOINs for the response.
 * Used by both GET and PUT to produce consistent shape.
 */
async function fetchReturnWithJoins(id: string) {
  const result = await turso.execute({
    sql: `SELECT r."id", r."returnNo", r."transactionId", r."transactionItemId",
                r."productId", r."productName", r."quantity", r."unitPrice",
                r."refundAmount", r."reason", r."reasonNote", r."customerId",
                r."customerName", r."userId", r."status", r."approvedById",
                r."approvedAt", r."refundMethod", r."refundProcessed", r."restocked",
                r."notes", r."createdAt", r."updatedAt",
                u."id" AS "userId_val", u."name" AS "userName", u."role" AS "userRole",
                a."id" AS "approvedById_val", a."name" AS "approvedByName",
                t."transactionNo", t."userId" AS "transactionUserId", t."status" AS "txnStatus", t."subtotal" AS "txnSubtotal", t."total" AS "txnTotal",
                ti."id" AS "txItemId", ti."quantity" AS "txItemQty", ti."unitPrice" AS "txItemUnitPrice",
                ti."subtotal" AS "txItemSubtotal", ti."requiresRx" AS "txItemRequiresRx",
                ti."productName" AS "txItemProductName", ti."productId" AS "txItemProductId",
                ti."sellingUnit" AS "txItemSellingUnit", ti."itemsPerUnit" AS "txItemItemsPerUnit",
                p."id" AS "prodId", p."name" AS "prodName", p."ndc" AS "prodNdc", p."category" AS "prodCategory",
                p."costPrice" AS "prodCostPrice", p."sellingUnit" AS "prodSellingUnit", p."itemsPerUnit" AS "prodItemsPerUnit"
         FROM "Return" r
         LEFT JOIN "User" u ON u."id" = r."userId"
         LEFT JOIN "User" a ON a."id" = r."approvedById"
         LEFT JOIN "Transaction" t ON t."id" = r."transactionId"
         LEFT JOIN "TransactionItem" ti ON ti."id" = r."transactionItemId"
         LEFT JOIN "Product" p ON p."id" = r."productId"
         WHERE r."id" = ?`,
    args: [id],
  })

  if (result.rows.length === 0) return null

  const row = toObjs(result)[0]
  return {
    id: row.id,
    returnNo: row.returnNo,
    transactionId: row.transactionId,
    transactionItemId: row.transactionItemId,
    productId: row.productId,
    productName: row.productName,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
    refundAmount: Number(row.refundAmount),
    reason: row.reason,
    reasonNote: row.reasonNote,
    customerId: row.customerId,
    customerName: row.customerName,
    userId: row.userId,
    status: row.status,
    approvedById: row.approvedById,
    approvedAt: row.approvedAt,
    refundMethod: row.refundMethod,
    refundProcessed: bool(row.refundProcessed),
    restocked: bool(row.restocked),
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user: row.userId_val ? { id: row.userId_val, name: row.userName, role: row.userRole } : null,
    approvedBy: row.approvedById_val
      ? { id: row.approvedById_val, name: row.approvedByName }
      : null,
    transaction: row.transactionNo
      ? {
          transactionNo: row.transactionNo,
          status: row.txnStatus,
          subtotal: row.txnSubtotal,
          total: row.txnTotal,
        }
      : null,
    transactionUserId: row.transactionUserId || null,
    transactionItem: row.txItemId
      ? {
          id: row.txItemId,
          transactionId: row.transactionId,
          productId: row.txItemProductId,
          productName: row.txItemProductName,
          quantity: Number(row.txItemQty),
          unitPrice: Number(row.txItemUnitPrice),
          subtotal: Number(row.txItemSubtotal),
          requiresRx: bool(row.txItemRequiresRx),
          sellingUnit: (row.txItemSellingUnit as string) || 'EA',
          itemsPerUnit: Number(row.txItemItemsPerUnit) || 1,
        }
      : null,
    product: row.prodId
      ? {
          id: row.prodId, name: row.prodName, ndc: row.prodNdc, category: row.prodCategory,
          costPrice: row.prodCostPrice != null ? Number(row.prodCostPrice) : null,
          sellingUnit: (row.prodSellingUnit as string) || 'EA',
          itemsPerUnit: Number(row.prodItemsPerUnit) || 1,
        }
      : null,
  }
}

// ---------------------------------------------------------------------------
// GET /api/returns/[id] — single return detail
// RBAC: SUPER_ADMIN sees all; other roles can only view their own returns
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const requesterRole = req.headers.get('x-user-role') || ''
    const requesterId = req.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    // ---- Turso raw SQL path ----
    if (isTurso()) {
      const returnRecord = await fetchReturnWithJoins(id)
      if (!returnRecord) {
        return NextResponse.json({ error: 'Return not found' }, { status: 404 })
      }

      // RBAC: non-admin can only view their own returns
      if (!isSuperAdmin && returnRecord.userId !== requesterId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }

      return NextResponse.json({ return: returnRecord })
    }

    // ---- Prisma fallback ----
    const { db } = await import('@/lib/db')
    const returnRecord = await db.return.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, role: true } },
        approvedBy: { select: { id: true, name: true } },
        transaction: { select: { transactionNo: true, items: true } },
        transactionItem: true,
        product: { select: { id: true, name: true, ndc: true, category: true } },
      },
    })

    if (!returnRecord) {
      return NextResponse.json({ error: 'Return not found' }, { status: 404 })
    }

    if (!isSuperAdmin && returnRecord.userId !== requesterId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({ return: returnRecord })
  } catch (error) {
    console.error('GET /api/returns/[id] error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch return', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT /api/returns/[id] — approve, reject, complete, or cancel a return
// RBAC: SUPER_ADMIN can approve/reject/complete any return
//       Other roles can only cancel their own PENDING_APPROVAL returns
// ---------------------------------------------------------------------------

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action, approvedById, refundMethod, notes } = body

    const requesterRole = req.headers.get('x-user-role') || ''
    const requesterId = req.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    // ---- Turso raw SQL path ----
    if (isTurso()) {
      // Fetch existing return + the transaction's userId for ownership check
      const existingResult = await turso.execute({
        sql: `SELECT r."id", r."returnNo", r."status", r."userId", r."productId",
                    r."transactionId", r."transactionItemId", r."quantity", r."notes", r."refundMethod",
                    t."userId" AS "transactionUserId"
             FROM "Return" r
             LEFT JOIN "Transaction" t ON r."transactionId" = t."id"
             WHERE r."id" = ?`,
        args: [id],
      })
      if (existingResult.rows.length === 0) {
        return NextResponse.json({ error: 'Return not found' }, { status: 404 })
      }
      const existing = toObjs(existingResult)[0]

      // RBAC: SUPER_ADMIN can do anything.
      // Non-admin: must be the return creator OR the transaction owner.
      // Return creator can cancel; transaction owner can approve/reject/complete.
      if (!isSuperAdmin) {
        const isReturnCreator = existing.userId === requesterId
        const isTransactionOwner = existing.transactionUserId === requesterId
        if (!isReturnCreator && !isTransactionOwner) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
        // Only transaction owner (or admin) can approve/reject/complete
        if (!isTransactionOwner && action !== 'cancel') {
          return NextResponse.json(
            { error: 'Only the transaction owner or admin can approve, reject, or complete returns' },
            { status: 403 },
          )
        }
      }

      const now = new Date().toISOString()

      // ---- APPROVE ----
      if (action === 'approve') {
        if (existing.status !== 'PENDING_APPROVAL') {
          return NextResponse.json(
            { error: 'Only pending returns can be approved' },
            { status: 400 },
          )
        }

        const returnQty = Number(existing.quantity) // selling units returned
        const productId = existing.productId as string
        const transactionItemId = existing.transactionItemId as string
        const transactionId = existing.transactionId as string

        // Fetch original transaction item to get itemsPerUnit for base-unit conversion
        const txItemResult = await turso.execute({
          sql: 'SELECT "quantity", "unitPrice", "sellingUnit", "itemsPerUnit" FROM "TransactionItem" WHERE "id" = ?',
          args: [transactionItemId],
        })
        const txItem = txItemResult.rows.length > 0 ? toObjs(txItemResult)[0] : null
        const itemsPerUnit = txItem ? (Number(txItem.itemsPerUnit) || 1) : 1
        const sellingUnit = (txItem?.sellingUnit as string) || 'EA'
        // Convert selling units → base units for inventory/batch restock
        const baseUnitsToRestock = returnQty * itemsPerUnit

        // 1. Add returned stock to the product's ORIGINAL batch (not create a new one)
        //    Strategy: match by product + costPrice + expiryDate (most likely original batch)
        //    Fallback 1: any batch for this product (even qty=0, ordered by most recent receivedAt)
        //    Fallback 2: only create new batch if no batch exists at all
        const prodResult = await turso.execute({
          sql: 'SELECT "costPrice", "expiryDate" FROM "Product" WHERE id = ?',
          args: [productId],
        })
        const prodRow = prodResult.rows.length > 0 ? toObjs(prodResult)[0] : null
        const prodCostPrice = prodRow ? Number(prodRow.costPrice) || 0 : 0
        const prodExpiryDate = prodRow?.expiryDate as string | null

        // Try exact match first: same product + same cost price + same expiry
        const exactBatch = await turso.execute({
          sql: `SELECT id, "batchNumber", quantity
                FROM "Batch"
                WHERE "productId" = ?
                  AND "costPrice" = ?
                  AND (("expiryDate" IS NULL AND ? IS NULL) OR ("expiryDate" = ?))
                ORDER BY "receivedAt" DESC
                LIMIT 1`,
          args: [productId, prodCostPrice, prodExpiryDate, prodExpiryDate],
        })

        // Fallback: any batch for this product (even qty=0)
        const anyBatch = await turso.execute({
          sql: `SELECT id, "batchNumber", quantity
                FROM "Batch"
                WHERE "productId" = ?
                ORDER BY "receivedAt" DESC
                LIMIT 1`,
          args: [productId],
        })

        let restockedBatchNo: string
        const matchedBatch = exactBatch.rows.length > 0
          ? toObjs(exactBatch)[0]
          : anyBatch.rows.length > 0
            ? toObjs(anyBatch)[0]
            : null

        if (matchedBatch) {
          restockedBatchNo = matchedBatch.batchNumber as string
          await turso.execute({
            sql: 'UPDATE "Batch" SET quantity = ?, "updatedAt" = ? WHERE id = ?',
            args: [Number(matchedBatch.quantity) + baseUnitsToRestock, now, matchedBatch.id],
          })
        } else {
          // Absolute last resort: no batch exists at all for this product
          restockedBatchNo = generateBatchNo()
          await turso.execute({
            sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "receivedBy", "createdAt", "updatedAt")
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              generateId(), productId, restockedBatchNo,
              prodExpiryDate,
              baseUnitsToRestock,
              prodCostPrice,
              now, approvedById || 'system-return', now, now,
            ],
          })
        }

        // 2. Recalculate Inventory.quantity as SUM of all batch quantities (same logic as auto-expiry)
        const sumResult = await turso.execute({
          sql: 'SELECT COALESCE(SUM(quantity), 0) as total FROM "Batch" WHERE "productId" = ?',
          args: [productId],
        })
        const newInvQty = Number(sumResult.rows[0][0]) || 0

        const invCheck = await turso.execute({
          sql: 'SELECT id FROM "Inventory" WHERE "productId" = ?',
          args: [productId],
        })
        if (invCheck.rows.length > 0) {
          await turso.execute({
            sql: 'UPDATE "Inventory" SET "quantity" = ?, "lastCounted" = ?, "updatedAt" = ? WHERE "productId" = ?',
            args: [newInvQty, now, now, productId],
          })
        } else {
          const invId = generateId()
          await turso.execute({
            sql: `INSERT INTO "Inventory" (id, "productId", quantity, "lastCounted", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)`,
            args: [invId, productId, newInvQty, now, now, now],
          })
        }

        // 3. Write ProductHistory entry for the restock
        writeProductHistory({
          productId,
          action: 'UPDATED',
          changedFields: ['quantity', 'returnRestock'],
          previousValues: { quantity: newInvQty - baseUnitsToRestock },
          newValues: { quantity: newInvQty, returnRestock: `${baseUnitsToRestock} base units (${returnQty} ${sellingUnit}) added to batch ${restockedBatchNo} via return ${(existing as any).returnNo || id}` },
          userId: approvedById || undefined,
        })

        // 4. Adjust the original transaction item (reduce quantity by returned amount)
        if (txItem) {
          const originalQty = Number(txItem.quantity)
          const unitPrice = Number(txItem.unitPrice)
          const returnedQty = Math.min(returnQty, originalQty)
          const adjQty = Math.max(0, originalQty - returnedQty)
          const adjSubtotal = unitPrice * adjQty

          await turso.execute({
            sql: 'UPDATE "TransactionItem" SET "quantity" = ?, "subtotal" = ? WHERE "id" = ?',
            args: [adjQty, adjSubtotal, transactionItemId],
          })
        }

        // 5. Recalculate and update the original transaction totals
        const allItemsResult = await turso.execute({
          sql: 'SELECT "subtotal" FROM "TransactionItem" WHERE "transactionId" = ?',
          args: [transactionId],
        })
        const allItems = toObjs(allItemsResult)
        const recalculatedSubtotal = allItems.reduce(
          (sum, item) => sum + Number(item.subtotal),
          0,
        )

        await turso.execute({
          sql: `UPDATE "Transaction" SET "subtotal" = ?, "total" = ?, "paymentAmount" = ?,
               "status" = ?, "updatedAt" = ? WHERE "id" = ?`,
          args: [
            recalculatedSubtotal,
            Math.max(0, recalculatedSubtotal),
            Math.max(0, recalculatedSubtotal),
            'REFUNDED',
            now,
            transactionId,
          ],
        })

        // 6. Update Return status to APPROVED
        await turso.execute({
          sql: `UPDATE "Return" SET "status" = ?, "approvedById" = ?, "approvedAt" = ?,
               "restocked" = 1, "notes" = ?, "updatedAt" = ? WHERE "id" = ?`,
          args: [
            'APPROVED',
            approvedById || null,
            now,
            notes || existing.notes || null,
            now,
            id,
          ],
        })

        const updated = await fetchReturnWithJoins(id)
        const { userId: aUid1, ipAddress: aIp1, userAgent: aUa1 } = getRequestContext(req)
        await writeAuditLog({ userId: aUid1, action: 'RETURN_APPROVED', category: 'return', entity: 'Return', entityId: id, ipAddress: aIp1, userAgent: aUa1 })
        return NextResponse.json({ return: updated })
      }

      // ---- REJECT ----
      if (action === 'reject') {
        if (existing.status !== 'PENDING_APPROVAL') {
          return NextResponse.json(
            { error: 'Only pending returns can be rejected' },
            { status: 400 },
          )
        }

        await turso.execute({
          sql: `UPDATE "Return" SET "status" = ?, "approvedById" = ?, "approvedAt" = ?,
               "notes" = ?, "updatedAt" = ? WHERE "id" = ?`,
          args: [
            'REJECTED',
            approvedById || null,
            now,
            notes || existing.notes || null,
            now,
            id,
          ],
        })

        const updated = await fetchReturnWithJoins(id)
        const { userId: aUid2, ipAddress: aIp2, userAgent: aUa2 } = getRequestContext(req)
        await writeAuditLog({ userId: aUid2, action: 'RETURN_REJECTED', category: 'return', entity: 'Return', entityId: id, ipAddress: aIp2, userAgent: aUa2 })
        return NextResponse.json({ return: updated })
      }

      // ---- COMPLETE ----
      // Works from both APPROVED (just finalize) and PENDING_APPROVAL (full restock + complete in one step)
      if (action === 'complete') {
        if (existing.status !== 'APPROVED' && existing.status !== 'PENDING_APPROVAL') {
          return NextResponse.json(
            { error: 'Only pending or approved returns can be completed' },
            { status: 400 },
          )
        }

        // If coming from PENDING, do the full restock logic (same as approve)
        if (existing.status === 'PENDING_APPROVAL') {
          const returnQty = Number(existing.quantity)
          const productId = existing.productId as string
          const transactionItemId = existing.transactionItemId as string
          const transactionId = existing.transactionId as string

          const txItemResult = await turso.execute({
            sql: 'SELECT "quantity", "unitPrice", "sellingUnit", "itemsPerUnit" FROM "TransactionItem" WHERE "id" = ?',
            args: [transactionItemId],
          })
          const txItem = txItemResult.rows.length > 0 ? toObjs(txItemResult)[0] : null
          const itemsPerUnit = txItem ? (Number(txItem.itemsPerUnit) || 1) : 1
          const sellingUnit = (txItem?.sellingUnit as string) || 'EA'
          const baseUnitsToRestock = returnQty * itemsPerUnit

          // Find original batch to restock into
          const prodResult = await turso.execute({
            sql: 'SELECT "costPrice", "expiryDate" FROM "Product" WHERE id = ?',
            args: [productId],
          })
          const prodRow = prodResult.rows.length > 0 ? toObjs(prodResult)[0] : null
          const prodCostPrice = prodRow ? Number(prodRow.costPrice) || 0 : 0
          const prodExpiryDate = prodRow?.expiryDate as string | null

          const exactBatch = await turso.execute({
            sql: `SELECT id, "batchNumber", quantity FROM "Batch"
                  WHERE "productId" = ? AND "costPrice" = ?
                    AND (("expiryDate" IS NULL AND ? IS NULL) OR ("expiryDate" = ?))
                  ORDER BY "receivedAt" DESC LIMIT 1`,
            args: [productId, prodCostPrice, prodExpiryDate, prodExpiryDate],
          })
          const anyBatch = await turso.execute({
            sql: `SELECT id, "batchNumber", quantity FROM "Batch"
                  WHERE "productId" = ? ORDER BY "receivedAt" DESC LIMIT 1`,
            args: [productId],
          })

          const matchedBatch = exactBatch.rows.length > 0
            ? toObjs(exactBatch)[0]
            : anyBatch.rows.length > 0 ? toObjs(anyBatch)[0] : null

          if (matchedBatch) {
            await turso.execute({
              sql: 'UPDATE "Batch" SET quantity = ?, "updatedAt" = ? WHERE id = ?',
              args: [Number(matchedBatch.quantity) + baseUnitsToRestock, now, matchedBatch.id],
            })
          } else {
            const newBatchNo = generateBatchNo()
            await turso.execute({
              sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "receivedBy", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [generateId(), productId, newBatchNo, prodExpiryDate, baseUnitsToRestock, prodCostPrice, now, approvedById || 'system-return', now, now],
            })
          }

          // Recalculate inventory
          const sumResult = await turso.execute({
            sql: 'SELECT COALESCE(SUM(quantity), 0) as total FROM "Batch" WHERE "productId" = ?',
            args: [productId],
          })
          const newInvQty = Number(sumResult.rows[0][0]) || 0
          const invCheck = await turso.execute({
            sql: 'SELECT id FROM "Inventory" WHERE "productId" = ?',
            args: [productId],
          })
          if (invCheck.rows.length > 0) {
            await turso.execute({
              sql: 'UPDATE "Inventory" SET "quantity" = ?, "lastCounted" = ?, "updatedAt" = ? WHERE "productId" = ?',
              args: [newInvQty, now, now, productId],
            })
          } else {
            await turso.execute({
              sql: `INSERT INTO "Inventory" (id, "productId", quantity, "lastCounted", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)`,
              args: [generateId(), productId, newInvQty, now, now, now],
            })
          }

          writeProductHistory({
            productId,
            action: 'UPDATED',
            changedFields: ['quantity', 'returnRestock'],
            previousValues: { quantity: newInvQty - baseUnitsToRestock },
            newValues: { quantity: newInvQty, returnRestock: `${baseUnitsToRestock} base units (${returnQty} ${sellingUnit}) added to batch via return ${(existing as any).returnNo || id}` },
            userId: approvedById || undefined,
          })

          // Adjust original transaction item
          if (txItem) {
            const originalQty = Number(txItem.quantity)
            const unitPrice = Number(txItem.unitPrice)
            const returnedQty = Math.min(returnQty, originalQty)
            const adjQty = Math.max(0, originalQty - returnedQty)
            await turso.execute({
              sql: 'UPDATE "TransactionItem" SET "quantity" = ?, "subtotal" = ? WHERE "id" = ?',
              args: [adjQty, unitPrice * adjQty, transactionItemId],
            })
          }

          // Recalculate transaction totals
          const allItemsResult = await turso.execute({
            sql: 'SELECT "subtotal" FROM "TransactionItem" WHERE "transactionId" = ?',
            args: [transactionId],
          })
          const allItems = toObjs(allItemsResult)
          const recalculatedSubtotal = allItems.reduce((sum, item) => sum + Number(item.subtotal), 0)
          await turso.execute({
            sql: `UPDATE "Transaction" SET "subtotal" = ?, "total" = ?, "paymentAmount" = ?, "status" = ?, "updatedAt" = ? WHERE "id" = ?`,
            args: [recalculatedSubtotal, Math.max(0, recalculatedSubtotal), Math.max(0, recalculatedSubtotal), 'REFUNDED', now, transactionId],
          })
        }

        // Mark as COMPLETED (with restocked + refundProcessed)
        await turso.execute({
          sql: `UPDATE "Return" SET "status" = ?, "approvedById" = COALESCE("approvedById", ?), "approvedAt" = COALESCE("approvedAt", ?),
               "restocked" = 1, "refundProcessed" = 1, "refundMethod" = ?, "notes" = ?, "updatedAt" = ? WHERE "id" = ?`,
          args: [
            'COMPLETED',
            approvedById || null, now,
            refundMethod || existing.refundMethod || 'CASH',
            notes || existing.notes || null,
            now, id,
          ],
        })

        const updated = await fetchReturnWithJoins(id)
        const { userId: aUid3, ipAddress: aIp3, userAgent: aUa3 } = getRequestContext(req)
        await writeAuditLog({ userId: aUid3, action: action === 'cancel' ? 'RETURN_CANCELLED' : 'RETURN_APPROVED', category: 'return', entity: 'Return', entityId: id, ipAddress: aIp3, userAgent: aUa3 })
        return NextResponse.json({ return: updated })
      }

      // ---- CANCEL ----
      if (action === 'cancel') {
        if (existing.status === 'COMPLETED') {
          return NextResponse.json(
            { error: 'Completed returns cannot be cancelled' },
            { status: 400 },
          )
        }

        await turso.execute({
          sql: `UPDATE "Return" SET "status" = ?, "notes" = ?, "updatedAt" = ? WHERE "id" = ?`,
          args: ['CANCELLED', notes || existing.notes || null, now, id],
        })

        const updated = await fetchReturnWithJoins(id)
        const { userId: aUid4, ipAddress: aIp4, userAgent: aUa4 } = getRequestContext(req)
        await writeAuditLog({ userId: aUid4, action: 'RETURN_CANCELLED', category: 'return', entity: 'Return', entityId: id, ipAddress: aIp4, userAgent: aUa4 })
        return NextResponse.json({ return: updated })
      }

      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // ---- Prisma fallback ----
    const { db } = await import('@/lib/db')
    const existing = await db.return.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Return not found' }, { status: 404 })
    }

    // Fetch the transaction owner for RBAC
    const txn = await db.transaction.findUnique({ where: { id: existing.transactionId }, select: { userId: true } })
    const transactionUserId = txn?.userId || ''

    // RBAC: SUPER_ADMIN can do anything.
    // Non-admin: must be the return creator OR the transaction owner.
    // Return creator can cancel; transaction owner can approve/reject/complete.
    if (!isSuperAdmin) {
      const isReturnCreator = existing.userId === requesterId
      const isTransactionOwner = transactionUserId === requesterId
      if (!isReturnCreator && !isTransactionOwner) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      if (!isTransactionOwner && action !== 'cancel') {
        return NextResponse.json(
          { error: 'Only the transaction owner or admin can approve, reject, or complete returns' },
          { status: 403 },
        )
      }
    }

    let updated

    switch (action) {
      case 'approve': {
        if (existing.status !== 'PENDING_APPROVAL') {
          return NextResponse.json(
            { error: 'Only pending returns can be approved' },
            { status: 400 },
          )
        }

        const returnQty = Number(existing.quantity)

        // Fetch transaction item for itemsPerUnit conversion
        const txItem = await db.transactionItem.findUnique({
          where: { id: existing.transactionItemId },
        })
        const itemsPerUnit = txItem ? (Number((txItem as any).itemsPerUnit) || 1) : 1
        const sellingUnit = (txItem as any)?.sellingUnit || 'EA'
        const baseUnitsToRestock = returnQty * itemsPerUnit

        updated = await db.$transaction(async (tx) => {
          // 1. Restock into the original batch (not create a new one)
          try {
            // Fetch product for costPrice/expiryDate matching
            const product = await tx.product.findUnique({ where: { id: existing.productId } })
            const prodCostPrice = product ? Number(product.costPrice) || 0 : 0
            const prodExpiryDate = product?.expiryDate || null

            // Try exact match: same product + costPrice + expiryDate
            let batch = await tx.batch.findFirst({
              where: {
                productId: existing.productId,
                costPrice: prodCostPrice,
                ...(prodExpiryDate ? { expiryDate: prodExpiryDate } : { expiryDate: null }),
              },
              orderBy: { receivedAt: 'desc' },
            })

            // Fallback: any batch for this product (even qty=0)
            if (!batch) {
              batch = await tx.batch.findFirst({
                where: { productId: existing.productId },
                orderBy: { receivedAt: 'desc' },
              })
            }

            if (batch) {
              await tx.batch.update({
                where: { id: batch.id },
                data: { quantity: { increment: baseUnitsToRestock } },
              })
            } else {
              // Absolute last resort: no batch at all for this product
              await tx.batch.create({
                data: {
                  productId: existing.productId,
                  batchNumber: 'BN-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + String(Math.floor(Math.random()*10000)).padStart(4,'0'),
                  quantity: baseUnitsToRestock,
                  costPrice: prodCostPrice,
                  receivedAt: new Date(),
                  receivedBy: approvedById || 'system-return',
                },
              })
            }
          } catch {
            // Batch table might not exist in Prisma — fall through
          }

          // 2. Update inventory
          const existingInv = await tx.inventory.findUnique({
            where: { productId: existing.productId },
          })
          const currentQty = existingInv ? Number(existingInv.quantity) : 0
          const newInvQty = currentQty + baseUnitsToRestock

          if (existingInv) {
            await tx.inventory.update({
              where: { productId: existing.productId },
              data: { quantity: newInvQty, lastCounted: new Date() },
            })
          } else {
            await tx.inventory.create({
              data: { productId: existing.productId, quantity: newInvQty, lastCounted: new Date() },
            })
          }

          // 3. Adjust the original transaction item quantity
          if (txItem) {
            const originalQty = Number(txItem.quantity)
            const returnedQty = Math.min(returnQty, originalQty)
            const adjQty = Math.max(0, originalQty - returnedQty)
            const adjSubtotal = Number(txItem.unitPrice) * adjQty

            await tx.transactionItem.update({
              where: { id: existing.transactionItemId },
              data: { quantity: adjQty, subtotal: adjSubtotal },
            })
          }

          // 4. Recalculate and update the original transaction totals
          const allTxItems = await tx.transactionItem.findMany({
            where: { transactionId: existing.transactionId },
          })
          const recalculatedSubtotal = allTxItems.reduce(
            (sum, item) => sum + Number(item.subtotal),
            0,
          )

          await tx.transaction.update({
            where: { id: existing.transactionId },
            data: {
              subtotal: recalculatedSubtotal,
              total: Math.max(0, recalculatedSubtotal),
              paymentAmount: Math.max(0, recalculatedSubtotal),
              status: 'REFUNDED',
            },
          })

          // 5. Mark as approved with restocked flag
          return await tx.return.update({
            where: { id },
            data: {
              status: 'APPROVED',
              approvedById: approvedById || null,
              approvedAt: new Date(),
              restocked: true,
              notes: notes || existing.notes,
            },
            include: {
              user: { select: { id: true, name: true, role: true } },
              approvedBy: { select: { id: true, name: true } },
              product: { select: { id: true, name: true } },
              transaction: { select: { transactionNo: true, status: true, subtotal: true, total: true } },
            },
          })
        })

        // Product history (fire-and-forget)
        writeProductHistory({
          productId: existing.productId,
          action: 'UPDATED',
          changedFields: ['quantity', 'returnRestock'],
          previousValues: { quantity: (Number(existing.quantity) || 0) * itemsPerUnit - baseUnitsToRestock },
          newValues: { quantity: baseUnitsToRestock, returnRestock: `${baseUnitsToRestock} base units (${returnQty} ${sellingUnit}) via return ${existing.returnNo || id}` },
          userId: approvedById || undefined,
        })
        break
      }

      case 'reject': {
        if (existing.status !== 'PENDING_APPROVAL') {
          return NextResponse.json(
            { error: 'Only pending returns can be rejected' },
            { status: 400 },
          )
        }
        updated = await db.return.update({
          where: { id },
          data: {
            status: 'REJECTED',
            approvedById: approvedById || null,
            approvedAt: new Date(),
            notes: notes || existing.notes,
          },
          include: {
            user: { select: { id: true, name: true, role: true } },
            approvedBy: { select: { id: true, name: true } },
            product: { select: { id: true, name: true } },
            transaction: { select: { transactionNo: true } },
          },
        })
        break
      }

      case 'complete': {
        if (existing.status !== 'APPROVED' && existing.status !== 'PENDING_APPROVAL') {
          return NextResponse.json(
            { error: 'Only pending or approved returns can be completed' },
            { status: 400 },
          )
        }

        // If coming from PENDING, do full restock (same as approve)
        if (existing.status === 'PENDING_APPROVAL') {
          const returnQty = Number(existing.quantity)
          const txItem = await db.transactionItem.findUnique({ where: { id: existing.transactionItemId } })
          const itemsPerUnit = txItem ? (Number((txItem as any).itemsPerUnit) || 1) : 1
          const sellingUnit = (txItem as any)?.sellingUnit || 'EA'
          const baseUnitsToRestock = returnQty * itemsPerUnit

          updated = await db.$transaction(async (tx) => {
            try {
              const product = await tx.product.findUnique({ where: { id: existing.productId } })
              const prodCostPrice = product ? Number(product.costPrice) || 0 : 0
              const prodExpiryDate = product?.expiryDate || null
              let batch = await tx.batch.findFirst({
                where: { productId: existing.productId, costPrice: prodCostPrice, ...(prodExpiryDate ? { expiryDate: prodExpiryDate } : { expiryDate: null }) },
                orderBy: { receivedAt: 'desc' },
              })
              if (!batch) {
                batch = await tx.batch.findFirst({ where: { productId: existing.productId }, orderBy: { receivedAt: 'desc' } })
              }
              if (batch) {
                await tx.batch.update({ where: { id: batch.id }, data: { quantity: { increment: baseUnitsToRestock } } })
              } else {
                await tx.batch.create({
                  data: { productId: existing.productId, batchNumber: 'BN-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + String(Math.floor(Math.random()*10000)).padStart(4,'0'), quantity: baseUnitsToRestock, costPrice: prodCostPrice, receivedAt: new Date(), receivedBy: approvedById || 'system-return' },
                })
              }
            } catch { /* Batch table might not exist */ }

            const existingInv = await tx.inventory.findUnique({ where: { productId: existing.productId } })
            const currentQty = existingInv ? Number(existingInv.quantity) : 0
            if (existingInv) {
              await tx.inventory.update({ where: { productId: existing.productId }, data: { quantity: currentQty + baseUnitsToRestock, lastCounted: new Date() } })
            } else {
              await tx.inventory.create({ data: { productId: existing.productId, quantity: baseUnitsToRestock, lastCounted: new Date() } })
            }

            if (txItem) {
              const adjQty = Math.max(0, Number(txItem.quantity) - returnQty)
              await tx.transactionItem.update({ where: { id: existing.transactionItemId }, data: { quantity: adjQty, subtotal: Number(txItem.unitPrice) * adjQty } })
            }

            const allTxItems = await tx.transactionItem.findMany({ where: { transactionId: existing.transactionId } })
            const recalculatedSubtotal = allTxItems.reduce((sum, item) => sum + Number(item.subtotal), 0)
            await tx.transaction.update({
              where: { id: existing.transactionId },
              data: { subtotal: recalculatedSubtotal, total: Math.max(0, recalculatedSubtotal), paymentAmount: Math.max(0, recalculatedSubtotal), status: 'REFUNDED' },
            })

            return await tx.return.update({
              where: { id },
              data: { status: 'COMPLETED', approvedById: approvedById || null, approvedAt: new Date(), restocked: true, refundProcessed: true, refundMethod: refundMethod || existing.refundMethod, notes: notes || existing.notes },
              include: { user: { select: { id: true, name: true, role: true } }, approvedBy: { select: { id: true, name: true } }, product: { select: { id: true, name: true } }, transaction: { select: { transactionNo: true, status: true, subtotal: true, total: true } } },
            })
          })

          writeProductHistory({
            productId: existing.productId, action: 'UPDATED', changedFields: ['quantity', 'returnRestock'],
            previousValues: { quantity: (Number(existing.quantity) || 0) * itemsPerUnit - baseUnitsToRestock },
            newValues: { quantity: baseUnitsToRestock, returnRestock: `${baseUnitsToRestock} base units (${returnQty} ${sellingUnit}) via return ${existing.returnNo || id}` },
            userId: approvedById || undefined,
          })
        } else {
          // Already APPROVED — just finalize
          updated = await db.return.update({
            where: { id },
            data: { status: 'COMPLETED', restocked: true, refundProcessed: true, refundMethod: refundMethod || existing.refundMethod, notes: notes || existing.notes },
            include: { user: { select: { id: true, name: true, role: true } }, approvedBy: { select: { id: true, name: true } }, product: { select: { id: true, name: true } }, transaction: { select: { transactionNo: true, status: true, subtotal: true, total: true } } },
          })
        }
        break
      }

      case 'cancel': {
        if (existing.status === 'COMPLETED') {
          return NextResponse.json(
            { error: 'Completed returns cannot be cancelled' },
            { status: 400 },
          )
        }
        updated = await db.return.update({
          where: { id },
          data: { status: 'CANCELLED', notes: notes || existing.notes },
          include: {
            user: { select: { id: true, name: true, role: true } },
            approvedBy: { select: { id: true, name: true } },
            product: { select: { id: true, name: true } },
            transaction: { select: { transactionNo: true } },
          },
        })
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const auditAction = action === 'approve' ? 'RETURN_APPROVED' : action === 'reject' ? 'RETURN_REJECTED' : action === 'cancel' ? 'RETURN_CANCELLED' : 'RETURN_UPDATED'
    const { userId: aUid5, ipAddress: aIp5, userAgent: aUa5 } = getRequestContext(req)
    await writeAuditLog({ userId: aUid5, action: auditAction, category: 'return', entity: 'Return', entityId: id, ipAddress: aIp5, userAgent: aUa5 })
    return NextResponse.json({ return: updated })
  } catch (error) {
    console.error('PUT /api/returns/[id] error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to update return', detail: msg }, { status: 500 })
  }
}
