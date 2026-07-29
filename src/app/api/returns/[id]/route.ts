import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Use shared db instance (supports Turso adapter)

// GET /api/returns/[id] — single return detail
// RBAC: SUPER_ADMIN sees all; other roles can only view their own returns
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // RBAC: extract requester role and userId from headers
    const requesterRole = req.headers.get('x-user-role') || ''
    const requesterId = req.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    const returnRecord = await db.return.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, role: true } },
        approvedBy: { select: { id: true, name: true } },
        transaction: {
          select: { transactionNo: true, items: true },
        },
        transactionItem: true,
        product: { select: { id: true, name: true, ndc: true, category: true } },
      },
    })

    if (!returnRecord) {
      return NextResponse.json({ error: 'Return not found' }, { status: 404 })
    }

    // Non-admin can only view their own returns
    if (!isSuperAdmin && returnRecord.userId !== requesterId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({ return: returnRecord })
  } catch (error) {
    console.error('GET /api/returns/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch return' }, { status: 500 })
  }
}

// PUT /api/returns/[id] — approve, reject, complete, or cancel a return
// RBAC: SUPER_ADMIN can approve/reject/complete any return
//       Other roles can only cancel their own PENDING_APPROVAL returns
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action, approvedById, refundMethod, notes } = body

    // RBAC: extract requester role and userId from headers
    const requesterRole = req.headers.get('x-user-role') || ''
    const requesterId = req.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    const existing = await db.return.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Return not found' }, { status: 404 })
    }

    // Non-admin users: only allow cancelling their own pending returns
    if (!isSuperAdmin) {
      if (existing.userId !== requesterId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      if (action !== 'cancel') {
        return NextResponse.json(
          { error: 'Only admin can approve, reject, or complete returns' },
          { status: 403 }
        )
      }
    }

    let updated

    switch (action) {
      case 'approve': {
        if (existing.status !== 'PENDING_APPROVAL') {
          return NextResponse.json(
            { error: 'Only pending returns can be approved' },
            { status: 400 }
          )
        }

        const returnQty = Number(existing.quantity)

        updated = await db.$transaction(async (tx) => {
          // 1. Restock the product inventory (read-modify-write for Turso compatibility)
          const existingInv = await tx.inventory.findUnique({
            where: { productId: existing.productId },
          })
          const currentQty = existingInv ? Number(existingInv.quantity) : 0
          const newInvQty = currentQty + returnQty

          if (existingInv) {
            await tx.inventory.update({
              where: { productId: existing.productId },
              data: {
                quantity: newInvQty,
                lastCounted: new Date(),
              },
            })
          } else {
            await tx.inventory.create({
              data: {
                productId: existing.productId,
                quantity: newInvQty,
                lastCounted: new Date(),
              },
            })
          }

          // 2. Adjust the original transaction item quantity (reduce by returned amount)
          const txItem = await tx.transactionItem.findUnique({
            where: { id: existing.transactionItemId },
          })
          if (txItem) {
            const originalQty = Number(txItem.quantity)
            const returnedQty = Math.min(returnQty, originalQty)
            const adjQty = Math.max(0, originalQty - returnedQty)
            const adjSubtotal = Number(txItem.unitPrice) * adjQty

            await tx.transactionItem.update({
              where: { id: existing.transactionItemId },
              data: {
                quantity: adjQty,
                subtotal: adjSubtotal,
              },
            })
          }

          // 3. Recalculate and update the original transaction totals
          const allTxItems = await tx.transactionItem.findMany({
            where: { transactionId: existing.transactionId },
          })
          const recalculatedSubtotal = allTxItems.reduce(
            (sum, item) => sum + Number(item.subtotal),
            0
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

          // 4. Mark as approved with restocked flag
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
        break
      }

      case 'reject': {
        if (existing.status !== 'PENDING_APPROVAL') {
          return NextResponse.json(
            { error: 'Only pending returns can be rejected' },
            { status: 400 }
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
        if (existing.status !== 'APPROVED') {
          return NextResponse.json(
            { error: 'Only approved returns can be completed' },
            { status: 400 }
          )
        }

        // Inventory restock and transaction adjustments already done during approve.
        // Complete just finalizes the return record.
        updated = await db.return.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            restocked: true,
            refundProcessed: true,
            refundMethod: refundMethod || existing.refundMethod,
            notes: notes || existing.notes,
          },
          include: {
            user: { select: { id: true, name: true, role: true } },
            approvedBy: { select: { id: true, name: true } },
            product: { select: { id: true, name: true } },
            transaction: { select: { transactionNo: true, status: true, subtotal: true, total: true } },
          },
        })
        break
      }

      case 'cancel': {
        if (existing.status === 'COMPLETED') {
          return NextResponse.json(
            { error: 'Completed returns cannot be cancelled' },
            { status: 400 }
          )
        }
        updated = await db.return.update({
          where: { id },
          data: {
            status: 'CANCELLED',
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

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({ return: updated })
  } catch (error) {
    console.error('PUT /api/returns/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update return' }, { status: 500 })
  }
}
