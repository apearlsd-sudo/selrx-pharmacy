import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Helper: Generate return number RTN-YYYYMMDD-XXXX
function generateReturnNo(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')
  return `RTN-${date}-${random}`
}

// GET /api/returns - List returns with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const action = searchParams.get('action')

    // GET /api/returns?action=stats - Return statistics
    if (action === 'stats') {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      const [todayReturns, monthReturns, pendingReturns, totalRefunded] = await Promise.all([
        db.return.count({
          where: { createdAt: { gte: startOfDay } },
        }),
        db.return.count({
          where: { createdAt: { gte: startOfMonth } },
        }),
        db.return.count({
          where: { status: 'PENDING_APPROVAL' },
        }),
        db.return.aggregate({
          where: { status: { in: ['APPROVED', 'COMPLETED'] } },
          _sum: { refundAmount: true },
        }),
      ])

      const todayRefunded = await db.return.aggregate({
        where: {
          createdAt: { gte: startOfDay },
          status: { in: ['APPROVED', 'COMPLETED'] },
        },
        _sum: { refundAmount: true, quantity: true },
      })

      return NextResponse.json({
        today: {
          count: todayReturns,
          refundAmount: todayRefunded._sum.refundAmount || 0,
          itemsReturned: todayRefunded._sum.quantity || 0,
        },
        thisMonth: {
          count: monthReturns,
        },
        pendingApproval: pendingReturns,
        totalRefunded: totalRefunded._sum.refundAmount || 0,
      })
    }

    // Regular return list
    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (from || to) {
      where.createdAt = {}
      if (from) {
        ;(where.createdAt as Record<string, unknown>).gte = new Date(from)
      }
      if (to) {
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        ;(where.createdAt as Record<string, unknown>).lte = toDate
      }
    }

    const skip = (page - 1) * limit

    const [returns, total] = await Promise.all([
      db.return.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          transaction: {
            select: { id: true, transactionNo: true },
          },
          transactionItem: {
            select: { id: true, productName: true, unitPrice: true, quantity: true },
          },
          product: {
            select: { id: true, name: true, sellingPrice: true, dosageForm: true, strength: true },
          },
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          approvedBy: {
            select: { id: true, name: true },
          },
        },
      }),
      db.return.count({ where }),
    ])

    return NextResponse.json({
      returns,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching returns:', error)
    return NextResponse.json(
      { error: 'Failed to fetch returns' },
      { status: 500 }
    )
  }
}

// POST /api/returns - Create a new return (restock + refund)
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'demo-user'
    const body = await request.json()
    const {
      transactionId,
      transactionItemId,
      productId,
      productName,
      quantity,
      unitPrice,
      refundAmount,
      reason,
      reasonNote,
      customerId,
      customerName,
      refundMethod,
      notes,
    } = body

    // Validate required fields
    if (!transactionId || !transactionItemId || !productId || !quantity || !refundAmount) {
      return NextResponse.json(
        { error: 'Transaction ID, Transaction Item ID, Product ID, quantity, and refund amount are required' },
        { status: 400 }
      )
    }

    if (!reason) {
      return NextResponse.json(
        { error: 'Return reason is required' },
        { status: 400 }
      )
    }

    // Verify the transaction item exists
    const txItem = await db.transactionItem.findUnique({
      where: { id: transactionItemId },
      include: {
        transaction: {
          select: { id: true, status: true, customer: { select: { firstName: true, lastName: true } } },
        },
      },
    })

    if (!txItem) {
      return NextResponse.json(
        { error: 'Transaction item not found' },
        { status: 404 }
      )
    }

    // Check quantity doesn't exceed original purchase
    const existingReturns = await db.return.findMany({
      where: {
        transactionItemId,
        status: { in: ['PENDING_APPROVAL', 'APPROVED', 'COMPLETED'] },
      },
      _sum: { quantity: true },
    })

    const alreadyReturned = existingReturns.length > 0 ? (existingReturns[0]._sum.quantity || 0) : 0
    if (quantity > (txItem.quantity - alreadyReturned)) {
      return NextResponse.json(
        {
          error: `Return quantity exceeds purchasable amount. Already returned: ${alreadyReturned}, Original: ${txItem.quantity}`,
        },
        { status: 400 }
      )
    }

    const returnNo = generateReturnNo()

    // Create the return record
    const returnRecord = await db.return.create({
      data: {
        returnNo,
        transactionId,
        transactionItemId,
        productId,
        productName: productName || txItem.productName,
        quantity,
        unitPrice: unitPrice || txItem.unitPrice,
        refundAmount,
        reason,
        reasonNote: reasonNote || null,
        customerId: customerId || null,
        customerName: customerName || (txItem.transaction.customer
          ? `${txItem.transaction.customer.firstName} ${txItem.transaction.customer.lastName}`
          : null),
        userId,
        refundMethod: refundMethod || 'CASH',
        notes: notes || null,
      },
      include: {
        transaction: { select: { transactionNo: true } },
        product: { select: { name: true } },
        user: { select: { name: true } },
      },
    })

    return NextResponse.json(returnRecord, { status: 201 })
  } catch (error) {
    console.error('Error creating return:', error)
    return NextResponse.json(
      { error: 'Failed to create return' },
      { status: 500 }
    )
  }
}
