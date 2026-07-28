import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/sales-history - Sales history with user breakdown
// Supports ?from=&to=&userId=&page=&limit=&groupBy=user|daily
// RBAC: SUPER_ADMIN sees all users; other roles see only their own data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const userId = searchParams.get('userId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    // RBAC: extract requester role and userId from headers
    const requesterRole = request.headers.get('x-user-role') || ''
    const requesterId = request.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    // Non-SUPER_ADMIN users can only see their own sales
    const effectiveUserId = isSuperAdmin ? userId : (requesterId || userId)

    // Build date filter
    const dateFilter: Record<string, unknown> = {}
    if (from) dateFilter.gte = new Date(from)
    if (to) {
      const toDate = new Date(to)
      toDate.setHours(23, 59, 59, 999)
      dateFilter.lte = toDate
    }

    const baseWhere: Record<string, unknown> = {
      status: 'COMPLETED',
    }
    if (Object.keys(dateFilter).length > 0) {
      baseWhere.createdAt = dateFilter
    }
    if (effectiveUserId) {
      baseWhere.userId = effectiveUserId
    }

    // 1. Overall summary stats
    const [allTransactions, totalSalesAgg] = await Promise.all([
      db.transaction.findMany({
        where: baseWhere,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          customer: {
            select: { id: true, firstName: true, lastName: true },
          },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.transaction.aggregate({
        where: baseWhere,
        _count: true,
        _sum: { total: true, subtotal: true, discount: true },
      }),
    ])

    // 2. Sales by user (aggregated)
    const userSales = await db.transaction.groupBy({
      by: ['userId'],
      where: baseWhere,
      _count: true,
      _sum: { total: true, subtotal: true, discount: true },
      orderBy: { _sum: { total: 'desc' } },
    })

    // Enrich user sales with user details
    const userIds = userSales.map((u) => u.userId)
    const users = userIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, role: true, createdAt: true },
        })
      : []

    const userMap: Record<string, typeof users[0]> = {}
    for (const u of users) {
      userMap[u.id] = u
    }

    // Get items count per user
    const userItemsCount = await db.transactionItem.groupBy({
      by: ['transactionId'],
      where: {
        transaction: baseWhere,
      },
      _sum: { quantity: true },
    })

    // Count items per transaction then aggregate by user
    const txnItemsMap: Record<string, number> = {}
    for (const ti of userItemsCount) {
      txnItemsMap[ti.transactionId] = ti._sum.quantity || 0
    }

    const userSalesEnriched = userSales.map((us) => {
      const user = userMap[us.userId]
      const userTxns = allTransactions.filter((t) => t.userId === us.userId)
      const totalItems = userTxns.reduce((sum, t) => {
        return sum + (txnItemsMap[t.id] || 0)
      }, 0)

      return {
        userId: us.userId,
        userName: user?.name || 'Unknown',
        userEmail: user?.email || '',
        userRole: user?.role || 'CLERK',
        transactionCount: us._count,
        totalSales: us._sum.total || 0,
        totalSubtotal: us._sum.subtotal || 0,
        totalDiscount: us._sum.discount || 0,
        averageSale: us._count > 0 ? (us._sum.total || 0) / us._count : 0,
        totalItemsSold: totalItems,
      }
    })

    // 3. Daily sales trend
    const dailySales = await db.transaction.groupBy({
      by: ['createdAt'],
      where: baseWhere,
      _count: true,
      _sum: { total: true },
    })

    // Aggregate by date string
    const dailyMap: Record<string, { date: string; sales: number; count: number }> = {}
    for (const ds of dailySales) {
      const dateStr = new Date(ds.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      if (dailyMap[dateStr]) {
        dailyMap[dateStr].sales += ds._sum.total || 0
        dailyMap[dateStr].count += ds._count
      } else {
        dailyMap[dateStr] = {
          date: dateStr,
          sales: ds._sum.total || 0,
          count: ds._count,
        }
      }
    }
    const dailySalesArray = Object.values(dailyMap).sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    }).slice(-30) // Last 30 days

    // 4. Paginated transactions for the table
    const skip = (page - 1) * limit
    const [paginatedTxns, paginatedTotal] = await Promise.all([
      db.transaction.findMany({
        where: baseWhere,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          customer: {
            select: { id: true, firstName: true, lastName: true },
          },
          items: true,
        },
      }),
      db.transaction.count({ where: baseWhere }),
    ])

    // 5. Top seller
    const topSeller = userSalesEnriched.length > 0 ? userSalesEnriched[0] : null

    return NextResponse.json({
      summary: {
        totalSales: totalSalesAgg._sum.total || 0,
        totalTransactions: totalSalesAgg._count,
        totalDiscount: totalSalesAgg._sum.discount || 0,
        averageTransaction: totalSalesAgg._count > 0
          ? (totalSalesAgg._sum.total || 0) / totalSalesAgg._count
          : 0,
        topSeller,
        dateRange: {
          from: from || null,
          to: to || null,
        },
      },
      salesByUser: userSalesEnriched,
      dailySales: dailySalesArray,
      transactions: paginatedTxns,
      pagination: {
        page,
        limit,
        total: paginatedTotal,
        pages: Math.ceil(paginatedTotal / limit),
      },
      allUsers: users.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
      })),
    })
  } catch (error) {
    console.error('Error fetching sales history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sales history' },
      { status: 500 }
    )
  }
}
