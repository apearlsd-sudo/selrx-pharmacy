import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET /api/returns — list returns with optional filters
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const status = url.searchParams.get('status')
    const reason = url.searchParams.get('reason')
    const search = url.searchParams.get('search')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const limit = parseInt(url.searchParams.get('limit') || '20', 10)

    const where: Record<string, unknown> = {}

    if (status && status !== 'ALL') {
      where.status = status
    }
    if (reason && reason !== 'ALL') {
      where.reason = reason
    }
    if (search) {
      where.OR = [
        { returnNo: { contains: search } },
        { productName: { contains: search } },
        { customerName: { contains: search } },
      ]
    }
    if (from || to) {
      where.createdAt = {}
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from)
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to)
    }

    const [returns, total] = await Promise.all([
      prisma.return.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, role: true } },
          approvedBy: { select: { id: true, name: true } },
          transaction: { select: { transactionNo: true } },
          product: { select: { id: true, name: true, ndc: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.return.count({ where }),
    ])

    // Summary stats
    const [totalReturns, pendingCount, completedCount, totalRefundAmount] = await Promise.all([
      prisma.return.count(),
      prisma.return.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.return.count({ where: { status: 'COMPLETED' } }),
      prisma.return.aggregate({
        where: { status: { in: ['APPROVED', 'COMPLETED'] } },
        _sum: { refundAmount: true },
      }),
    ])

    const topReasons = await prisma.return.groupBy({
      by: ['reason'],
      _count: { reason: true },
      orderBy: { _count: { reason: 'desc' } },
      take: 5,
    })

    return NextResponse.json({
      returns,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary: {
        totalReturns,
        pendingCount,
        completedCount,
        totalRefundAmount: totalRefundAmount._sum.refundAmount || 0,
        topReasons,
      },
    })
  } catch (error) {
    console.error('GET /api/returns error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch returns' },
      { status: 500 }
    )
  }
}

// POST /api/returns — create a return (restock product + create ticket)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
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
      userId,
      refundMethod,
    } = body

    // Validate required fields
    if (!transactionId || !transactionItemId || !productId || !productName || !quantity || !unitPrice || !reason || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (quantity <= 0) {
      return NextResponse.json(
        { error: 'Quantity must be greater than 0' },
        { status: 400 }
      )
    }

    // Generate return number: RTN-YYYYMMDD-XXXX
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayReturns = await prisma.return.count({
      where: {
        createdAt: { gte: todayStart },
      },
    })
    const seq = String(todayReturns + 1).padStart(4, '0')
    const returnNo = `RTN-${dateStr}-${seq}`

    // Create the return record
    const returnRecord = await prisma.return.create({
      data: {
        returnNo,
        transactionId,
        transactionItemId,
        productId,
        productName,
        quantity,
        unitPrice,
        refundAmount: refundAmount || unitPrice * quantity,
        reason,
        reasonNote,
        customerId: customerId || null,
        customerName: customerName || null,
        userId,
        refundMethod: refundMethod || 'CASH',
        status: 'PENDING_APPROVAL',
        restocked: false,
        refundProcessed: false,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        transaction: { select: { transactionNo: true } },
        product: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ return: returnRecord }, { status: 201 })
  } catch (error) {
    console.error('POST /api/returns error:', error)
    return NextResponse.json(
      { error: 'Failed to create return' },
      { status: 500 }
    )
  }
}
