import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/returns/[id] - Get single return
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const returnRecord = await db.return.findUnique({
      where: { id },
      include: {
        transaction: {
          select: { transactionNo: true, paymentMethod: true, createdAt: true },
          include: {
            user: { select: { name: true, role: true } },
          },
        },
        transactionItem: {
          select: { productName: true, unitPrice: true, quantity: true },
        },
        product: {
          select: { name: true, sellingPrice: true, dosageForm: true, strength: true, unitOfMeasure: true },
        },
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
        approvedBy: {
          select: { id: true, name: true },
        },
      },
    })

    if (!returnRecord) {
      return NextResponse.json({ error: 'Return not found' }, { status: 404 })
    }

    return NextResponse.json(returnRecord)
  } catch (error) {
    console.error('Error fetching return:', error)
    return NextResponse.json({ error: 'Failed to fetch return' }, { status: 500 })
  }
}

// PUT /api/returns/[id] - Approve/complete/reject/cancel a return
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const userId = request.headers.get('x-user-id') || 'demo-user'
    const body = await request.json()
    const { action, refundMethod, notes } = body

    const returnRecord = await db.return.findUnique({ where: { id } })

    if (!returnRecord) {
      return NextResponse.json({ error: 'Return not found' }, { status: 404 })
    }

    switch (action) {
      case 'approve': {
        if (returnRecord.status !== 'PENDING_APPROVAL') {
          return NextResponse.json(
            { error: 'Only pending returns can be approved' },
            { status: 400 }
          )
        }

        const approved = await db.return.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedById: userId,
            approvedAt: new Date(),
            notes: notes || returnRecord.notes,
          },
          include: {
            transaction: { select: { transactionNo: true } },
            product: { select: { name: true } },
            user: { select: { name: true } },
            approvedBy: { select: { name: true } },
          },
        })

        return NextResponse.json(approved)
      }

      case 'complete': {
        if (returnRecord.status !== 'APPROVED') {
          return NextResponse.json(
            { error: 'Only approved returns can be completed' },
            { status: 400 }
          )
        }

        // Restock the product back to inventory
        await db.inventory.update({
          where: { productId: returnRecord.productId },
          data: {
            quantity: { increment: returnRecord.quantity },
            lastCounted: new Date(),
          },
        })

        const completed = await db.return.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            restocked: true,
            refundProcessed: true,
            refundMethod: refundMethod || returnRecord.refundMethod,
            notes: notes || returnRecord.notes,
          },
          include: {
            transaction: { select: { transactionNo: true } },
            product: { select: { name: true } },
            user: { select: { name: true } },
            approvedBy: { select: { name: true } },
          },
        })

        return NextResponse.json(completed)
      }

      case 'reject': {
        if (returnRecord.status !== 'PENDING_APPROVAL') {
          return NextResponse.json(
            { error: 'Only pending returns can be rejected' },
            { status: 400 }
          )
        }

        const rejected = await db.return.update({
          where: { id },
          data: {
            status: 'REJECTED',
            approvedById: userId,
            approvedAt: new Date(),
            notes: notes || returnRecord.notes,
          },
          include: {
            transaction: { select: { transactionNo: true } },
            product: { select: { name: true } },
            user: { select: { name: true } },
            approvedBy: { select: { name: true } },
          },
        })

        return NextResponse.json(rejected)
      }

      case 'cancel': {
        if (returnRecord.status === 'COMPLETED') {
          return NextResponse.json(
            { error: 'Completed returns cannot be cancelled' },
            { status: 400 }
          )
        }

        // If restocked, undo the restock
        if (returnRecord.restocked) {
          await db.inventory.update({
            where: { productId: returnRecord.productId },
            data: {
              quantity: { decrement: returnRecord.quantity },
              lastCounted: new Date(),
            },
          })
        }

        const cancelled = await db.return.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            restocked: false,
            notes: notes || returnRecord.notes,
          },
          include: {
            transaction: { select: { transactionNo: true } },
            product: { select: { name: true } },
            user: { select: { name: true } },
            approvedBy: { select: { name: true } },
          },
        })

        return NextResponse.json(cancelled)
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: approve, complete, reject, or cancel' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error updating return:', error)
    return NextResponse.json({ error: 'Failed to update return' }, { status: 500 })
  }
}
