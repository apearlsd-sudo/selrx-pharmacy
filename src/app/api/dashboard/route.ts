import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toObjs(result: { columns: Array<string>; rows: Array<Array<unknown>> }) {
  const names = result.columns.map((c) => c)
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((n, i) => {
      obj[n] = row[i]
    })
    return obj
  })
}

// ---------------------------------------------------------------------------
// GET /api/dashboard  –  comprehensive dashboard data
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    // RBAC
    const requesterRole = request.headers.get('x-user-role') || ''
    const requesterId = request.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(startOfDay)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    if (isTurso()) {
      const userClause = isSuperAdmin ? '' : (requesterId ? ' AND userId = ?' : " AND userId = '__none__'")
      const userArgs: unknown[] = isSuperAdmin ? [] : requesterId ? [requesterId] : []

      // Run all dashboard queries in parallel
      const in30Days = new Date(now)
      in30Days.setDate(in30Days.getDate() + 30)

      const [
        todayResult,
        weekResult,
        inventoryResult,
        rxCountResult,
        topResult,
        recentResult,
        totalCustomersResult,
        inventoryValueResult,
        totalProductsResult,
        expiringCountResult,
        reorderCountResult,
      ] = await Promise.all([

        // 1. Today's completed transactions
        turso.execute({
          sql: `SELECT total FROM "Transaction"
                WHERE status = 'COMPLETED' AND createdAt >= ?${userClause}`,
          args: [startOfDay.toISOString(), ...userArgs],
        }),

        // 2. Week's completed transactions (for trend)
        turso.execute({
          sql: `SELECT id, total, createdAt FROM "Transaction"
                WHERE status = 'COMPLETED' AND createdAt >= ?${userClause}
                ORDER BY createdAt ASC`,
          args: [startOfWeek.toISOString(), ...userArgs],
        }),

        // 3. All inventory with product (for low stock alerts)
        turso.execute({
          sql: `SELECT i.productId, i.quantity, i.lastCounted, i.createdAt as i_createdAt,
                       i.updatedAt as i_updatedAt,
                       p.reorderPoint as p_reorderPoint, p.name as p_name
                FROM Inventory i
                LEFT JOIN Product p ON i.productId = p.id`,
          args: [],
        }),

        // 4. Pending prescriptions count
        turso.execute({
          sql: `SELECT COUNT(*) as cnt FROM Prescription
                WHERE status IN ('PENDING', 'IN_PROGRESS', 'READY')`,
          args: [],
        }),

        // 5. Top 5 selling products this month
        turso.execute({
          sql: `SELECT ti.productId as productId, ti.productName as productName,
                       SUM(ti.quantity) as totalQty, SUM(ti.subtotal) as totalSubtotal
                FROM TransactionItem ti
                JOIN "Transaction" t ON ti.transactionId = t.id
                WHERE t.status = 'COMPLETED' AND t.createdAt >= ?${userClause}
                GROUP BY ti.productId, ti.productName
                ORDER BY totalSubtotal DESC
                LIMIT 5`,
          args: [startOfMonth.toISOString(), ...userArgs],
        }),

        // 6. Recent 10 transactions with user/customer names
        turso.execute({
          sql: `SELECT t.id as t_id, t.transactionNo as t_transactionNo, t.total as t_total,
                      t.status as t_status, t.createdAt as t_createdAt,
                      u.id as u_id, u.name as u_name,
                      c.id as c_id, c.firstName as c_firstName, c.lastName as c_lastName
               FROM "Transaction" t
               LEFT JOIN User u ON t.userId = u.id
               LEFT JOIN Customer c ON t.customerId = c.id
               ${isSuperAdmin ? '' : `WHERE t.userId = ?`}
               ORDER BY t.createdAt DESC
               LIMIT 10`,
          args: isSuperAdmin ? [] : requesterId ? [requesterId] : [],
        }),

        // 7. Total customers
        turso.execute({
          sql: `SELECT COUNT(*) as cnt FROM Customer`,
          args: [],
        }),

        // 8. Inventory value at cost
        turso.execute({
          sql: `SELECT COALESCE(SUM(i.quantity * COALESCE(p."costPrice", 0)), 0) as val
                FROM Inventory i
                JOIN Product p ON p.id = i."productId"
                WHERE p.status = 'ACTIVE'`,
          args: [],
        }),

        // 9. Total active products
        turso.execute({
          sql: `SELECT COUNT(*) as cnt FROM Product WHERE status = 'ACTIVE'`,
          args: [],
        }),

        // 10. Products expiring within 30 days
        turso.execute({
          sql: `SELECT COUNT(*) as cnt FROM Product p
                JOIN Inventory i ON i."productId" = p.id
                WHERE p.status = 'ACTIVE' AND p."expiryDate" IS NOT NULL
                  AND p."expiryDate" != ''
                  AND date(p."expiryDate") >= date('now')
                  AND date(p."expiryDate") <= date('now', '+30 days')`,
          args: [],
        }),

        // 11. Products below reorder point
        turso.execute({
          sql: `SELECT COUNT(*) as cnt FROM Product p
                JOIN Inventory i ON i."productId" = p.id
                WHERE p.status = 'ACTIVE' AND i.quantity <= p.reorderPoint`,
          args: [],
        }),
      ])

      // ---- Process today's transactions ----
      const todayRows = toObjs(todayResult)
      const todaySales = todayRows.reduce((sum, r) => sum + (r.total as number), 0)
      const todayCount = todayRows.length

      // ---- Weekly trend (group by day) ----
      const weekRows = toObjs(weekResult)
      const weeklyTrend: { date: string; sales: number; count: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(startOfDay)
        dayStart.setDate(dayStart.getDate() - i)
        const dayEnd = new Date(dayStart)
        dayEnd.setDate(dayEnd.getDate() + 1)

        const dayStartISO = dayStart.toISOString()
        const dayEndISO = dayEnd.toISOString()

        const dayTxns = weekRows.filter(
          (r) => {
            const d = r.createdAt as string
            return d >= dayStartISO && d < dayEndISO
          },
        )

        weeklyTrend.push({
          date: dayStart.toISOString().slice(0, 10),
          sales: dayTxns.reduce((sum, r) => sum + (r.total as number), 0),
          count: dayTxns.length,
        })
      }

      // ---- Low stock alerts ----
      const allInv = toObjs(inventoryResult)
      const lowStockAlerts = allInv.filter(
        (r) => (r.quantity as number) <= (r.p_reorderPoint as number),
      )

      // ---- Pending prescriptions ----
      const pendingPrescriptions = toObjs(rxCountResult)[0]?.cnt as number ?? 0

      // ---- Top products ----
      const topProducts = toObjs(topResult).map((r) => ({
        productId: r.productId,
        productName: r.productName,
        _sum: { quantity: (r.totalQty as number) ?? 0, subtotal: (r.totalSubtotal as number) ?? 0 },
      }))

      // ---- Recent transactions ----
      const recentTransactions = toObjs(recentResult).map((r) => ({
        id: r.t_id,
        transactionNo: r.t_transactionNo,
        total: r.t_total,
        status: r.t_status,
        createdAt: r.t_createdAt,
        user: r.u_id ? { id: r.u_id, name: r.u_name } : null,
        customer: r.c_id ? { id: r.c_id, firstName: r.c_firstName, lastName: r.c_lastName } : null,
      }))

      // ---- New KPIs ----
      const totalCustomers = (toObjs(totalCustomersResult)[0]?.cnt as number) ?? 0
      const inventoryValue = (toObjs(inventoryValueResult)[0]?.val as number) ?? 0
      const totalProducts = (toObjs(totalProductsResult)[0]?.cnt as number) ?? 0
      const expiringCount = (toObjs(expiringCountResult)[0]?.cnt as number) ?? 0
      const reorderCount = (toObjs(reorderCountResult)[0]?.cnt as number) ?? 0

      return NextResponse.json({
        today: { sales: todaySales, count: todayCount },
        weeklyTrend,
        lowStockAlerts: {
          count: lowStockAlerts.length,
          items: lowStockAlerts.slice(0, 10).map((inv) => ({
            productId: inv.productId,
            productName: inv.p_name,
            quantity: inv.quantity,
            reorderPoint: inv.p_reorderPoint,
          })),
        },
        pendingPrescriptions,
        topProducts,
        recentTransactions,
        totalCustomers,
        inventoryValue,
        totalProducts,
        expiringCount,
        reorderCount,
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const userFilter = isSuperAdmin ? {} : (requesterId ? { userId: requesterId } : { userId: '__none__' })

    const in30Days = new Date(now)
    in30Days.setDate(in30Days.getDate() + 30)

    const [
      todayTransactions,
      weekTransactions,
      allInventory,
      pendingPrescriptions,
      topProducts,
      recentTransactions,
      totalCustomersCount,
      inventoryValueAgg,
      totalActiveProducts,
      expiringCountPrisma,
      reorderCountPrisma,
    ] = await Promise.all([

      db.transaction.findMany({
        where: { createdAt: { gte: startOfDay }, status: 'COMPLETED', ...userFilter },
      }),

      db.transaction.findMany({
        where: { createdAt: { gte: startOfWeek }, status: 'COMPLETED', ...userFilter },
        select: { id: true, total: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),

      db.inventory.findMany({ include: { product: true } }),

      db.prescription.count({
        where: { status: { in: ['PENDING', 'IN_PROGRESS', 'READY'] } },
      }),

      db.transactionItem.groupBy({
        by: ['productId', 'productName'],
        where: { transaction: { status: 'COMPLETED', createdAt: { gte: startOfMonth }, ...userFilter } },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 5,
      }),

      db.transaction.findMany({
        where: userFilter,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
          customer: { select: { id: true, firstName: true, lastName: true } },
        },
      }),

      db.customer.count(),

      db.$queryRaw<Array<{ val: bigint }>>`
        SELECT SUM(i.quantity * COALESCE(p."costPrice", 0)) as val
        FROM Inventory i
        JOIN Product p ON p.id = i."productId"
        WHERE p.status = 'ACTIVE'
      `,

      db.product.count({ where: { status: 'ACTIVE' } }),

      db.product.count({
        where: {
          status: 'ACTIVE',
          expiryDate: { not: null, gte: now, lte: in30Days },
        },
      }),

      db.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(*) as cnt FROM Product p
        JOIN Inventory i ON i."productId" = p.id
        WHERE p."status" = 'ACTIVE' AND i.quantity <= p."reorderPoint"
      `,
    ])

    const todaySales = todayTransactions.reduce((sum, t) => sum + t.total, 0)
    const todayCount = todayTransactions.length

    const weeklyTrend: { date: string; sales: number; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfDay)
      dayStart.setDate(dayStart.getDate() - i)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      const dayTxns = weekTransactions.filter(
        (t) => t.createdAt >= dayStart && t.createdAt < dayEnd,
      )

      weeklyTrend.push({
        date: dayStart.toISOString().slice(0, 10),
        sales: dayTxns.reduce((sum, t) => sum + t.total, 0),
        count: dayTxns.length,
      })
    }

    const lowStockAlerts = allInventory.filter(
      (inv) => inv.quantity <= inv.product.reorderPoint,
    )

    return NextResponse.json({
      today: { sales: todaySales, count: todayCount },
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
      totalCustomers: totalCustomersCount,
      inventoryValue: Number(inventoryValueAgg[0]?.val || 0),
      totalProducts: totalActiveProducts,
      expiringCount: expiringCountPrisma,
      reorderCount: Number(reorderCountPrisma[0]?.cnt || 0),
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data', detail: msg }, { status: 500 })
  }
}
