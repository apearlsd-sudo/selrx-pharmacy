import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Use shared db instance (supports Turso adapter)

// GET /api/returns/[id] — single return detail
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    return NextResponse.json({ return: returnRecord })
  } catch (error) {
    console.error('GET /api/returns/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch return' }, { status: 500 })
  }
}

// PUT /api/returns/[id] — approve, reject, complete, or cancel a return
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action, approvedById, refundMethod, notes } = body

    const existing = await db.return.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Return not found' }, { status: 404 })
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
        updated = await db.return.update({
          where: { id },
          data: {
            status: 'APPROVED',
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

        const returnQty = Number(existing.quantity)

        // 1. Restock the product inventory
        await db.inventory.upsert({
          where: { productId: existing.productId },
          update: { quantity: { increment: returnQty } },
          create: { productId: existing.productId, quantity: returnQty },
        })

        // 2. Adjust the original transaction item quantity (reduce by returned amount)
        const txItem = await db.transactionItem.findUnique({
          where: { id: existing.transactionItemId },
        })
        if (txItem) {
          const originalQty = Number(txItem.quantity)
          const returnedQty = Math.min(returnQty, originalQty)
          const newQty = Math.max(0, originalQty - returnedQty)
          const newSubtotal = Number(txItem.unitPrice) * newQty

          await db.transactionItem.update({
            where: { id: existing.transactionItemId },
            data: {
              quantity: newQty,
              subtotal: newSubtotal,
            },
          })
        }

        // 3. Recalculate and update the original transaction totals
        const allTxItems = await db.transactionItem.findMany({
          where: { transactionId: existing.transactionId },
        })
        const newSubtotal = allTxItems.reduce(
          (sum, item) => sum + Number(item.subtotal),
          0
        )

        // Mark the original transaction as REFUNDED (since a return was processed against it)
        await db.transaction.update({
          where: { id: existing.transactionId },
          data: {
            subtotal: newSubtotal,
            total: Math.max(0, newSubtotal),
            paymentAmount: Math.max(0, newSubtotal),
            status: 'REFUNDED',
          },
        })

        // 4. Mark the return as completed
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
