import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/dashboard - Get comprehensive dashboard data
// RBAC: SUPER_ADMIN sees all data; other roles see only their own
export async function GET(request: NextRequest) {
  try {
    // RBAC: extract requester role and userId from headers
    const requesterRole = request.headers.get('x-user-role') || ''
    const requesterId = request.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    // For non-SUPER_ADMIN, only fetch their own transactions
    const userFilter = isSuperAdmin ? {} : (requesterId ? { userId: requesterId } : { userId: '__none__' })

    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(startOfDay)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Run all dashboard queries in parallel
    const [
      todayTransactions,
      weekTransactions,
      allInventory,
      pendingPrescriptions,
      topProducts,
      recentTransactions,
    ] = await Promise.all([
      // Today's transactions
      db.transaction.findMany({
        where: {
          createdAt: { gte: startOfDay },
          status: 'COMPLETED',
          ...userFilter,
        },
      }),

      // Weekly transactions (last 7 days for trend)
      db.transaction.findMany({
        where: {
          createdAt: { gte: startOfWeek },
          status: 'COMPLETED',
          ...userFilter,
        },
        select: {
          id: true,
          total: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),

      // All inventory for low stock alerts
      db.inventory.findMany({
        include: { product: true },
      }),

      // Pending prescriptions
      db.prescription.count({
        where: {
          status: { in: ['PENDING', 'IN_PROGRESS', 'READY'] },
        },
      }),

      // Top 5 selling products this month
      db.transactionItem.groupBy({
        by: ['productId', 'productName'],
        where: {
          transaction: {
            status: 'COMPLETED',
            createdAt: { gte: startOfMonth },
            ...userFilter,
          },
        },
        _sum: {
          quantity: true,
          subtotal: true,
        },
        orderBy: {
          _sum: { subtotal: 'desc' },
        },
        take: 5,
      }),

      // Recent transactions (last 10)
      db.transaction.findMany({
        where: userFilter,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true },
          },
          customer: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
    ])

    // Calculate today's sales
    const todaySales = todayTransactions.reduce((sum, t) => sum + t.total, 0)
    const todayCount = todayTransactions.length

    // Calculate weekly trend (group by day)
    const weeklyTrend: { date: string; sales: number; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfDay)
      dayStart.setDate(dayStart.getDate() - i)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      const dayTxns = weekTransactions.filter(
        (t) => t.createdAt >= dayStart && t.createdAt < dayEnd
      )

      weeklyTrend.push({
        date: dayStart.toISOString().slice(0, 10),
        sales: dayTxns.reduce((sum, t) => sum + t.total, 0),
        count: dayTxns.length,
      })
    }

    // Low stock alerts
    const lowStockAlerts = allInventory.filter(
      (inv) => inv.quantity <= inv.product.reorderPoint
    )

    return NextResponse.json({
      today: {
        sales: todaySales,
        count: todayCount,
      },
      weeklyTrend,
      lowStockAlerts: {
        count: lowStockAlerts.length,
        items: lowStockAlerts.slice(0, 10).map((inv) => ({
          productId: inv.productId,
          productName: inv.product.name,
          quantity: inv.quantity,
          reorderPoint: inv.product.reorderPoint,
        })),
      },
      pendingPrescriptions,
      topProducts,
      recentTransactions,
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
