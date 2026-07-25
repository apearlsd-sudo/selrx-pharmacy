import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/transactions/[id] - Get single transaction with items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const transaction = await db.transaction.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        prescription: {
          select: {
            id: true,
            rxNumber: true,
            productName: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                ndc: true,
                dosageForm: true,
                strength: true,
              },
            },
          },
        },
        hardwareLog: true,
      },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(transaction)
  } catch (error) {
    console.error('Error fetching transaction:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transaction' },
      { status: 500 }
    )
  }
}

// POST /api/transactions/[id]/void - Void a transaction (restore inventory)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = request.headers.get('x-user-role')
    if (
      role !== 'PHARMACIST' &&
      role !== 'SUPER_ADMIN' &&
      role !== 'CASHIER'
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action !== 'void') {
      return NextResponse.json(
        { error: 'Invalid action. Use ?action=void to void a transaction.' },
        { status: 400 }
      )
    }

    const transaction = await db.transaction.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    if (transaction.status === 'VOIDED') {
      return NextResponse.json(
        { error: 'Transaction is already voided' },
        { status: 400 }
      )
    }

    if (transaction.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Only completed transactions can be voided' },
        { status: 400 }
      )
    }

    // Restore inventory for all items
    for (const item of transaction.items) {
      await db.inventory.update({
        where: { productId: item.productId },
        data: {
          quantity: {
            increment: item.quantity,
          },
          lastCounted: new Date(),
        },
      })
    }

    // Update transaction status to VOIDED
    const voided = await db.transaction.update({
      where: { id },
      data: { status: 'VOIDED' },
      include: {
        user: { select: { id: true, name: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        items: true,
      },
    })

    return NextResponse.json({
      message: 'Transaction voided successfully',
      transaction: voided,
    })
  } catch (error) {
    console.error('Error voiding transaction:', error)
    return NextResponse.json(
      { error: 'Failed to void transaction' },
      { status: 500 }
    )
  }
}
