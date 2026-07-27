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

        // Restock the product inventory
        await db.inventory.upsert({
          where: { productId: existing.productId },
          update: { quantity: { increment: existing.quantity } },
          create: { productId: existing.productId, quantity: existing.quantity },
        })

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
            transaction: { select: { transactionNo: true } },
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
