import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Helper: Generate transaction number TXN-YYYYMMDD-XXXX
function generateTransactionNo(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')
  return `TXN-${date}-${random}`
}

// GET /api/transactions - List transactions with date filter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const action = searchParams.get('action')

    // GET /api/transactions/stats - Sales statistics
    if (action === 'stats') {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfWeek = new Date(startOfDay)
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      const [todayTxns, weekTxns, monthTxns, topProducts] = await Promise.all([
        db.transaction.findMany({
          where: {
            createdAt: { gte: startOfDay },
            status: 'COMPLETED',
          },
        }),
        db.transaction.findMany({
          where: {
            createdAt: { gte: startOfWeek },
            status: 'COMPLETED',
          },
        }),
        db.transaction.findMany({
          where: {
            createdAt: { gte: startOfMonth },
            status: 'COMPLETED',
          },
          include: { items: true },
        }),
        db.transactionItem.groupBy({
          by: ['productId', 'productName'],
          where: {
            transaction: {
              status: 'COMPLETED',
              createdAt: { gte: startOfMonth },
            },
          },
          _sum: { quantity: true, subtotal: true },
          orderBy: { _sum: { subtotal: 'desc' } },
          take: 10,
        }),
      ])

      const todayTotal = todayTxns.reduce((sum, t) => sum + t.total, 0)
      const weekTotal = weekTxns.reduce((sum, t) => sum + t.total, 0)
      const monthTotal = monthTxns.reduce((sum, t) => sum + t.total, 0)

      return NextResponse.json({
        today: {
          sales: todayTotal,
          count: todayTxns.length,
        },
        thisWeek: {
          sales: weekTotal,
          count: weekTxns.length,
        },
        thisMonth: {
          sales: monthTotal,
          count: monthTxns.length,
        },
        topProducts,
      })
    }

    // Regular transaction list
    const where: Record<string, unknown> = {}

    if (from || to) {
      where.createdAt = {}
      if (from) {
        ;(where.createdAt as Record<string, unknown>).gte = new Date(from)
      }
      if (to) {
        ;(where.createdAt as Record<string, unknown>).lte = new Date(to)
      }
    }

    if (status) {
      where.status = status
    }

    const search = searchParams.get('search')
    if (search) {
      where.OR = [
        { transactionNo: { contains: search } },
        { customer: { firstName: { contains: search } } },
        { customer: { lastName: { contains: search } } },
      ]
    }

    const skip = (page - 1) * limit

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          customer: {
            select: { id: true, firstName: true, lastName: true },
          },
          items: true,
        },
      }),
      db.transaction.count({ where }),
    ])

    return NextResponse.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}

// POST /api/transactions - Create new transaction (complete POS sale)
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'demo-user'
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // POST /api/transactions/[id]/void is handled in [id]/route.ts
    // But we need to handle the case where the action comes here
    if (action === 'void') {
      return NextResponse.json(
        { error: 'Use /api/transactions/[id] with POST for voiding' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      customerId,
      items,
      paymentMethod,
      subtotal,
      tax,
      discount,
      total,
      paymentAmount,
      prescriptionId,
      notes,
    } = body

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Transaction items are required' },
        { status: 400 }
      )
    }

    if (!paymentMethod) {
      return NextResponse.json(
        { error: 'Payment method is required' },
        { status: 400 }
      )
    }

    if (total === undefined || total === null) {
      return NextResponse.json(
        { error: 'Transaction total is required' },
        { status: 400 }
      )
    }

    // Check inventory for all items and deduct
    for (const item of items) {
      const inventory = await db.inventory.findUnique({
        where: { productId: item.productId },
      })

      if (!inventory || inventory.quantity < item.quantity) {
        const product = await db.product.findUnique({
          where: { id: item.productId },
        })
        return NextResponse.json(
          {
            error: `Insufficient stock for ${product?.name || 'product'} (available: ${inventory?.quantity || 0}, requested: ${item.quantity})`,
          },
          { status: 400 }
        )
      }
    }

    // Generate transaction number
    const transactionNo = generateTransactionNo()

    // Create transaction with items in a sequential manner
    const transaction = await db.transaction.create({
      data: {
        transactionNo,
        customerId: customerId || null,
        userId,
        subtotal: subtotal || 0,
        tax: tax || 0,
        discount: discount || 0,
        total,
        paymentMethod,
        paymentAmount: paymentAmount || total,
        changeAmount: Math.max(0, (paymentAmount || total) - total),
        status: 'COMPLETED',
        prescriptionId: prescriptionId || null,
        notes: notes || null,
        items: {
          create: items.map((item: Record<string, unknown>) => ({
            productId: item.productId as string,
            productName: item.productName as string,
            quantity: item.quantity as number,
            unitPrice: item.unitPrice as number,
            subtotal: item.subtotal as number,
            requiresRx: (item.requiresRx as boolean) || false,
            dispensedQty: item.quantity as number,
          })),
        },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        customer: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: true,
      },
    })

    // Deduct inventory for all items
    for (const item of items) {
      await db.inventory.update({
        where: { productId: item.productId as string },
        data: {
          quantity: {
            decrement: item.quantity as number,
          },
          lastCounted: new Date(),
        },
      })
    }

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    console.error('Error creating transaction:', error)
    return NextResponse.json(
      { error: 'Failed to create transaction' },
      { status: 500 }
    )
  }
}
