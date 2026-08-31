import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, safeArgs, toObjs } from '@/lib/turso'
import { formatDate } from '@/lib/date-utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /api/sales-history — Sales history with user breakdown
// Supports ?from=&to=&userId=&page=&limit=&groupBy=user|daily
// RBAC: SUPER_ADMIN sees all users; other roles see only their own data
// ---------------------------------------------------------------------------

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

    // Non-SUPER_ADMIN users can only see their own sales AND today only
    const effectiveUserId = isSuperAdmin ? userId : (requesterId || userId)

    // Enforce today-only date range for non-admin users at the API level
    let effectiveFrom = from
    let effectiveTo = to
    if (!isSuperAdmin) {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
      effectiveFrom = todayStr
      effectiveTo = todayStr
    }

    // ========================================================================
    // Turso (raw SQL) path
    // ========================================================================
    if (isTurso()) {
      // ---- Build dynamic WHERE clause ----
      const conditions: string[] = [`t."status" = 'COMPLETED'`]
      const args: any[] = []

      if (effectiveFrom) {
        conditions.push(`date(t."createdAt") >= ?`)
        args.push(effectiveFrom)
      }
      if (effectiveTo) {
        conditions.push(`date(t."createdAt") <= ?`)
        args.push(effectiveTo)
      }
      if (effectiveUserId) {
        conditions.push(`t."userId" = ?`)
        args.push(effectiveUserId)
      }

      const whereClause = conditions.join(' AND ')

      // ---- Build WHERE without userId filter for allUsers dropdown ----
      const conditionsNoUser = conditions.filter((c) => !c.includes('t."userId"'))
      const whereNoUser = conditionsNoUser.join(' AND ')

      // ---- Run 7 queries in parallel ----
      const [
        aggResult,
        userSalesResult,
        userItemsResult,
        dailyResult,
        pagResult,
        pagCountResult,
        allUsersResult,
      ] = await Promise.all([
        // 1. Overall aggregate: SUM total, COUNT, SUM discount
        turso.execute({
          sql: `SELECT COALESCE(SUM(t."total"), 0) as totalSales,
                       COUNT(*)                     as totalTransactions,
                       COALESCE(SUM(t."discount"), 0) as totalDiscount
                FROM "Transaction" t
                WHERE ${whereClause}`,
          args: safeArgs(args),
        }),

        // 2. Sales by user — GROUP BY userId with user name/email/role via JOIN
        turso.execute({
          sql: `SELECT t."userId",
                       COALESCE(SUM(t."total"), 0)    as totalSales,
                       COALESCE(SUM(t."subtotal"), 0) as totalSubtotal,
                       COALESCE(SUM(t."discount"), 0) as totalDiscount,
                       COUNT(*)                       as transactionCount,
                       u."name"  as userName,
                       u."email" as userEmail,
                       u."role"  as userRole
                FROM "Transaction" t
                LEFT JOIN User u ON t."userId" = u."id"
                WHERE ${whereClause}
                GROUP BY t."userId"
                ORDER BY totalSales DESC`,
          args: safeArgs(args),
        }),

        // 3. Items per user — direct SUM via TransactionItem JOIN Transaction
        turso.execute({
          sql: `SELECT t."userId",
                       COALESCE(SUM(ti."quantity"), 0) as totalItems
                FROM TransactionItem ti
                JOIN "Transaction" t ON ti."transactionId" = t."id"
                WHERE ${whereClause}
                GROUP BY t."userId"`,
          args: safeArgs(args),
        }),

        // 4. Daily sales — GROUP BY date, last 30 days with activity
        turso.execute({
          sql: `SELECT date(t."createdAt")         as day,
                       COALESCE(SUM(t."total"), 0)  as totalSales,
                       COUNT(*)                      as txCount
                FROM "Transaction" t
                WHERE ${whereClause}
                GROUP BY date(t."createdAt")
                ORDER BY day DESC
                LIMIT 30`,
          args: safeArgs(args),
        }),

        // 5. Paginated transactions with User & Customer JOINs
        turso.execute({
          sql: `SELECT t."id", t."transactionNo", t."customerId", t."userId",
                       t."subtotal", t."tax", t."discount", t."total",
                       t."paymentMethod", t."paymentAmount", t."changeAmount",
                       t."status", t."prescriptionId", t."notes",
                       t."createdAt", t."updatedAt",
                       u."id"        as u_id,
                       u."name"      as u_name,
                       u."email"     as u_email,
                       u."role"      as u_role,
                       c."id"        as c_id,
                       c."firstName" as c_firstName,
                       c."lastName"  as c_lastName
                FROM "Transaction" t
                LEFT JOIN User     u ON t."userId"     = u."id"
                LEFT JOIN Customer c ON t."customerId" = c."id"
                WHERE ${whereClause}
                ORDER BY t."createdAt" DESC
                LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
          args: safeArgs(args),
        }),

        // 6. Paginated total count
        turso.execute({
          sql: `SELECT COUNT(*) as cnt FROM "Transaction" t WHERE ${whereClause}`,
          args: safeArgs(args),
        }),

        // 7. All users for dropdown (only for SUPER_ADMIN)
        turso.execute({
          sql: `SELECT DISTINCT t."userId",
                       u."name"  as userName,
                       u."role"  as userRole
                FROM "Transaction" t
                LEFT JOIN User u ON t."userId" = u."id"
                WHERE t."status" = 'COMPLETED'
                ${isSuperAdmin ? '' : 'AND t."userId" = ?'}
                ORDER BY u."name" ASC`,
          args: isSuperAdmin ? [] : [requesterId],
        }),
      ])

      // ---- 1. Process aggregate ----
      const aggRow = toObjs(aggResult)[0]
      const totalSales = (aggRow?.totalSales as number) ?? 0
      const totalTransactions = (aggRow?.totalTransactions as number) ?? 0
      const totalDiscount = (aggRow?.totalDiscount as number) ?? 0

      // ---- 2. Process sales by user ----
      const userSalesRows = toObjs(userSalesResult)
      const userItemsRows = toObjs(userItemsResult)

      const userItemsMap: Record<string, number> = {}
      for (const r of userItemsRows) {
        userItemsMap[r.userId as string] = (r.totalItems as number) ?? 0
      }

      const userSalesEnriched = userSalesRows.map((r) => {
        const uid = r.userId as string
        const txCount = (r.transactionCount as number) ?? 0
        const sales = (r.totalSales as number) ?? 0
        return {
          userId: uid,
          userName: (r.userName as string) || 'Unknown',
          userEmail: (r.userEmail as string) || '',
          userRole: (r.userRole as string) || 'CLERK',
          transactionCount: txCount,
          totalSales: sales,
          totalSubtotal: (r.totalSubtotal as number) ?? 0,
          totalDiscount: (r.totalDiscount as number) ?? 0,
          averageSale: txCount > 0 ? sales / txCount : 0,
          totalItemsSold: userItemsMap[uid] || 0,
        }
      })

      // ---- 3. Process daily sales ----
      const dailyRows = toObjs(dailyResult)
      const dailySales = dailyRows
        .reverse() // SQL returned DESC → flip to ASC
        .map((r) => {
          const dayStr = r.day as string
          return {
            date: formatDate(dayStr + 'T12:00:00'),
            sales: (r.totalSales as number) ?? 0,
            count: (r.txCount as number) ?? 0,
          }
        })

      // ---- 4. Process paginated transactions ----
      const pagRows = toObjs(pagResult)
      const pagTotal = (toObjs(pagCountResult)[0]?.cnt as number) ?? 0

      // Fetch items for paginated transactions
      const pTxnIds = pagRows.map((r) => r.id as string)
      const pItemsMap: Record<string, unknown[]> = {}
      if (pTxnIds.length > 0) {
        const placeholders = pTxnIds.map(() => '?').join(', ')
        const itemsResult = await turso.execute({
          sql: `SELECT "id", "transactionId", "productId", "productName",
                       "quantity", "unitPrice", "subtotal", "requiresRx",
                       "dispensedQty", "createdAt"
                FROM TransactionItem
                WHERE "transactionId" IN (${placeholders})`,
          args: safeArgs(pTxnIds),
        })
        for (const row of toObjs(itemsResult)) {
          const tid = row.transactionId as string
          if (!pItemsMap[tid]) pItemsMap[tid] = []
          pItemsMap[tid].push({
            id: row.id,
            transactionId: row.transactionId,
            productId: row.productId,
            productName: row.productName,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            subtotal: row.subtotal,
            requiresRx: Boolean(row.requiresRx),
            dispensedQty: row.dispensedQty,
            createdAt: row.createdAt,
          })
        }
      }

      // Fetch insurance claims for paginated transactions (insurance payment detail)
      const claimsMap: Record<string, any> = {}
      const insuranceTxnIds = pagRows.filter((r) => r.paymentMethod === 'INSURANCE').map((r) => r.id as string)
      if (insuranceTxnIds.length > 0) {
        const icPlaceholders = insuranceTxnIds.map(() => '?').join(', ')
        try {
          const icResult = await turso.execute({
            sql: `SELECT "id", "transactionId", "claimNo", "insuranceProvider", "policyNumber",
                         "totalAmount", "approvedAmount", "coPayAmount", "status"
                  FROM InsuranceClaim
                  WHERE "transactionId" IN (${icPlaceholders})`,
            args: safeArgs(insuranceTxnIds),
          })
          for (const row of toObjs(icResult)) {
            claimsMap[row.transactionId as string] = {
              claimNo: row.claimNo,
              insuranceProvider: row.insuranceProvider,
              policyNumber: row.policyNumber,
              totalAmount: row.totalAmount,
              approvedAmount: row.approvedAmount,
              coPayAmount: row.coPayAmount,
              status: row.status,
            }
          }
        } catch { /* InsuranceClaim table may not exist yet */ }
      }

      // Fetch card payments for paginated transactions
      const cardPaymentsMap: Record<string, any> = {}
      const cardTxnIds = pagRows.filter((r) => r.paymentMethod === 'CREDIT_CARD' || r.paymentMethod === 'DEBIT_CARD').map((r) => r.id as string)
      if (cardTxnIds.length > 0) {
        const cpPlaceholders = cardTxnIds.map(() => '?').join(', ')
        try {
          const cpResult = await turso.execute({
            sql: `SELECT "id", "transactionId", "cardLast4", "cardBrand", "authCode", "refNumber", "status", "approvalMessage"
                   FROM CardPayment
                   WHERE "transactionId" IN (${cpPlaceholders})`,
            args: safeArgs(cardTxnIds),
          })
          for (const row of toObjs(cpResult)) {
            const brandLabel = (row.cardBrand as string)
              ? (row.cardBrand as string).replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
              : 'Card'
            cardPaymentsMap[row.transactionId as string] = {
              cardLast4: row.cardLast4,
              cardBrand: row.cardBrand,
              cardBrandLabel: brandLabel,
              authCode: row.authCode,
              refNumber: row.refNumber,
              status: row.status,
              approvalMessage: row.approvalMessage,
            }
          }
        } catch { /* CardPayment table may not exist yet */ }
      }

      const transactions = pagRows.map((r) => ({
        id: r.id,
        transactionNo: r.transactionNo,
        customerId: r.customerId,
        userId: r.userId,
        subtotal: r.subtotal,
        tax: r.tax,
        discount: r.discount,
        total: r.total,
        paymentMethod: r.paymentMethod,
        paymentAmount: r.paymentAmount,
        changeAmount: r.changeAmount,
        status: r.status,
        prescriptionId: r.prescriptionId,
        notes: r.notes,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        user: r.u_id
          ? { id: r.u_id, name: r.u_name, email: r.u_email, role: r.u_role }
          : null,
        customer: r.c_id
          ? { id: r.c_id, firstName: r.c_firstName, lastName: r.c_lastName }
          : null,
        items: pItemsMap[r.id as string] || [],
        insuranceClaim: claimsMap[r.id as string] || null,        cardPayment: cardPaymentsMap[r.id as string] || null,
      }))

      // ---- 5. Top seller = first user by total sales ----
      const topSeller = userSalesEnriched.length > 0 ? userSalesEnriched[0] : null

      // ---- 6. All users list (independent of userId filter) ----
      const allUsersRows = toObjs(allUsersResult)
      const allUsers = allUsersRows.map((r) => ({
        id: r.userId as string,
        name: (r.userName as string) || 'Unknown',
        role: (r.userRole as string) || 'CLERK',
      }))

      return NextResponse.json({
        summary: {
          totalSales,
          totalTransactions,
          totalDiscount,
          averageTransaction:
            totalTransactions > 0 ? totalSales / totalTransactions : 0,
          topSeller,
          dateRange: { from: from || null, to: to || null },
        },
        salesByUser: userSalesEnriched,
        dailySales,
        transactions,
        pagination: {
          page,
          limit,
          total: pagTotal,
          pages: Math.ceil(pagTotal / limit),
        },
        allUsers,
      })
    }

    // ========================================================================
    // Prisma fallback
    // ========================================================================
    const { db } = await import('@/lib/db')

    // Build date filter (non-admin forced to today)
    const dateFilter: Record<string, unknown> = {}
    if (effectiveFrom) dateFilter.gte = new Date(effectiveFrom + 'T00:00:00')
    if (effectiveTo) dateFilter.lte = new Date(effectiveTo + 'T23:59:59')

    const baseWhere: Record<string, unknown> = {
      status: 'COMPLETED',
    }
    if (Object.keys(dateFilter).length > 0) {
      baseWhere.createdAt = dateFilter
    }
    if (effectiveUserId) {
      baseWhere.userId = effectiveUserId
    }

    // Build baseWhere without any filters for allUsers dropdown (only SUPER_ADMIN gets all users)
    const baseWhereNoUser: Record<string, unknown> = { status: 'COMPLETED' }
    if (!isSuperAdmin && requesterId) {
      baseWhereNoUser.userId = requesterId
    }

    // 1. Overall summary stats
    const [allTransactions, totalSalesAgg, allUsersGrouped] = await Promise.all([
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

      // All users for dropdown (unfiltered by userId)
      db.transaction.groupBy({
        by: ['userId'],
        where: baseWhereNoUser,
      }),
    ])

    // Fetch all user details for dropdown
    const allUserIds = allUsersGrouped.map((u) => u.userId)
    const allUsersFromDb = allUserIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: allUserIds } },
          select: { id: true, name: true, role: true },
          orderBy: { name: 'asc' },
        })
      : []

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
    const dailyMap: Record<string, { rawDate: string; date: string; sales: number; count: number }> = {}
    for (const ds of dailySales) {
      const rawDate = new Date(ds.createdAt).toISOString().slice(0, 10)
      const dateStr = formatDate(ds.createdAt as string)
      const key = rawDate
      if (dailyMap[key]) {
        dailyMap[key].sales += ds._sum.total || 0
        dailyMap[key].count += ds._count
      } else {
        dailyMap[key] = {
          rawDate,
          date: dateStr,
          sales: ds._sum.total || 0,
          count: ds._count,
        }
      }
    }
    const dailySalesArray = Object.values(dailyMap).sort((a, b) => {
      return a.rawDate.localeCompare(b.rawDate)
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
            select: { id: true, firstName: true, lastName: true, insuranceProvider: true, insurancePolicyNo: true },
          },
          items: true,
          insuranceClaim: {
            select: {
              id: true,
              claimNo: true,
              insuranceProvider: true,
              policyNumber: true,
              totalAmount: true,
              approvedAmount: true,
              coPayAmount: true,
              status: true,
            },
          },
          cardPayment: {
            select: {
              id: true,
              cardLast4: true,
              cardBrand: true,
              authCode: true,
              refNumber: true,
              status: true,
              entryMethod: true,
              responseCode: true,
              approvalMessage: true,
            },
          },
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
      allUsers: allUsersFromDb.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
      })),
    })
  } catch (error) {
    console.error('Error fetching sales history:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to fetch sales history', detail: msg },
      { status: 500 }
    )
  }
}
