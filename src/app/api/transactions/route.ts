import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, generateTransactionNo, safeArgs } from '@/lib/turso'

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

const bool = (v: unknown): boolean => v === 1 || v === true

// ---------------------------------------------------------------------------
// GET /api/transactions
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const action = searchParams.get('action')

    // RBAC
    const requesterRole = request.headers.get('x-user-role') || ''
    const requesterId = request.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    // ---- Sales statistics ----
    if (action === 'stats') {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfWeek = new Date(startOfDay)
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      if (isTurso()) {
        const userClause = isSuperAdmin ? '' : (requesterId ? ' AND t.userId = ?' : ' AND t.userId = \'__none__\'')
        const commonArgs: unknown[] = isSuperAdmin
          ? []
          : requesterId ? [requesterId] : []

        // Today's completed transactions
        const todayResult = await turso.execute({
          sql: `SELECT total FROM "Transaction"
                WHERE status = 'COMPLETED' AND createdAt >= ?${userClause}`,
          args: safeArgs([startOfDay.toISOString(), ...commonArgs]),
        })

        // Week's completed transactions
        const weekResult = await turso.execute({
          sql: `SELECT id, total, createdAt FROM "Transaction"
                WHERE status = 'COMPLETED' AND createdAt >= ?${userClause}
                ORDER BY createdAt ASC`,
          args: safeArgs([startOfWeek.toISOString(), ...commonArgs]),
        })

        // Month's completed transactions (we need totals only)
        const monthResult = await turso.execute({
          sql: `SELECT total FROM "Transaction"
                WHERE status = 'COMPLETED' AND createdAt >= ?${userClause}`,
          args: safeArgs([startOfMonth.toISOString(), ...commonArgs]),
        })

        // Top products this month via GROUP BY
        const topResult = await turso.execute({
          sql: `SELECT ti.productId as productId, ti.productName as productName,
                       SUM(ti.quantity) as totalQty, SUM(ti.subtotal) as totalSubtotal
                FROM TransactionItem ti
                JOIN "Transaction" t ON ti.transactionId = t.id
                WHERE t.status = 'COMPLETED' AND t.createdAt >= ?${userClause}
                GROUP BY ti.productId, ti.productName
                ORDER BY totalSubtotal DESC
                LIMIT 10`,
          args: [startOfMonth.toISOString(), ...commonArgs],
        })

        const todayRows = toObjs(todayResult)
        const weekRows = toObjs(weekResult)
        const monthRows = toObjs(monthResult)
        const topRows = toObjs(topResult)

        const todayTotal = todayRows.reduce((sum, r) => sum + (r.total as number), 0)
        const weekTotal = weekRows.reduce((sum, r) => sum + (r.total as number), 0)
        const monthTotal = monthRows.reduce((sum, r) => sum + (r.total as number), 0)

        const topProducts = topRows.map((r) => ({
          productId: r.productId,
          productName: r.productName,
          _sum: { quantity: (r.totalQty as number) ?? 0, subtotal: (r.totalSubtotal as number) ?? 0 },
        }))

        return NextResponse.json({
          today: { sales: todayTotal, count: todayRows.length },
          thisWeek: { sales: weekTotal, count: weekRows.length },
          thisMonth: { sales: monthTotal, count: monthRows.length },
          topProducts,
        })
      }

      // Prisma fallback
      const { db } = await import('@/lib/db')
      const userFilter = isSuperAdmin ? {} : (requesterId ? { userId: requesterId } : { userId: '__none__' })

      const [todayTxns, weekTxns, monthTxns, topProducts] = await Promise.all([
        db.transaction.findMany({ where: { createdAt: { gte: startOfDay }, status: 'COMPLETED', ...userFilter } }),
        db.transaction.findMany({ where: { createdAt: { gte: startOfWeek }, status: 'COMPLETED', ...userFilter } }),
        db.transaction.findMany({ where: { createdAt: { gte: startOfMonth }, status: 'COMPLETED', ...userFilter }, include: { items: true } }),
        db.transactionItem.groupBy({
          by: ['productId', 'productName'],
          where: { transaction: { status: 'COMPLETED', createdAt: { gte: startOfMonth }, ...userFilter } },
          _sum: { quantity: true, subtotal: true },
          orderBy: { _sum: { subtotal: 'desc' } },
          take: 10,
        }),
      ])

      const todayTotal = todayTxns.reduce((sum, t) => sum + t.total, 0)
      const weekTotal = weekTxns.reduce((sum, t) => sum + t.total, 0)
      const monthTotal = monthTxns.reduce((sum, t) => sum + t.total, 0)

      return NextResponse.json({
        today: { sales: todayTotal, count: todayTxns.length },
        thisWeek: { sales: weekTotal, count: weekTxns.length },
        thisMonth: { sales: monthTotal, count: monthTxns.length },
        topProducts,
      })
    }

    // ---- Regular transaction list ----
    if (isTurso()) {
      // Build WHERE clauses dynamically
      const conditions: string[] = []
      const args: unknown[] = []

      // User filter
      if (!isSuperAdmin && requesterId) {
        conditions.push('t.userId = ?')
        args.push(requesterId)
      }

      // Date range
      if (from || to) {
        if (from) { conditions.push('t.createdAt >= ?'); args.push(new Date(from).toISOString()) }
        if (to) { conditions.push('t.createdAt <= ?'); args.push(new Date(to).toISOString()) }
      }

      // Status
      if (status) { conditions.push('t.status = ?'); args.push(status) }

      // Search (transactionNo LIKE or customer name LIKE)
      const search = searchParams.get('search')
      if (search) {
        conditions.push('(t.transactionNo LIKE \'%\' || ? || \'%\' OR c.firstName LIKE \'%\' || ? || \'%\' OR c.lastName LIKE \'%\' || ? || \'%\')')
        args.push(search, search, search)
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

      // Total count
      const countResult = await turso.execute({
        sql: `SELECT COUNT(*) as cnt FROM "Transaction" t
              LEFT JOIN Customer c ON t.customerId = c.id
              ${whereClause}`,
        args: safeArgs(args),
      })
      const total = toObjs(countResult)[0]?.cnt as number ?? 0

      // Paginated results with user & customer names + items
      const skip = (page - 1) * limit
      const listResult = await turso.execute({
        sql: `SELECT t.id as t_id, t.transactionNo as t_transactionNo, t.customerId as t_customerId,
                      t.userId as t_userId, t.subtotal as t_subtotal, t.tax as t_tax,
                      t.discount as t_discount, t.total as t_total, t.paymentMethod as t_paymentMethod,
                      t.paymentAmount as t_paymentAmount, t.changeAmount as t_changeAmount,
                      t.status as t_status, t.prescriptionId as t_prescriptionId,
                      t.notes as t_notes, t.createdAt as t_createdAt, t.updatedAt as t_updatedAt,
                      u.id as u_id, u.name as u_name, u.email as u_email,
                      c.id as c_id, c.firstName as c_firstName, c.lastName as c_lastName
               FROM "Transaction" t
               LEFT JOIN User u ON t.userId = u.id
               LEFT JOIN Customer c ON t.customerId = c.id
               ${whereClause}
               ORDER BY t.createdAt DESC
               LIMIT ${limit} OFFSET ${skip}`,
        args: safeArgs(args),
      })

      const transactions = toObjs(listResult).map((r) => {
        const txn: Record<string, unknown> = {
          id: r.t_id,
          transactionNo: r.t_transactionNo,
          customerId: r.t_customerId,
          userId: r.t_userId,
          subtotal: r.t_subtotal,
          tax: r.t_tax,
          discount: r.t_discount,
          total: r.t_total,
          paymentMethod: r.t_paymentMethod,
          paymentAmount: r.t_paymentAmount,
          changeAmount: r.t_changeAmount,
          status: r.t_status,
          prescriptionId: r.t_prescriptionId,
          notes: r.t_notes,
          createdAt: r.t_createdAt,
          updatedAt: r.t_updatedAt,
          user: r.u_id ? { id: r.u_id, name: r.u_name, email: r.u_email } : null,
          customer: r.c_id ? { id: r.c_id, firstName: r.c_firstName, lastName: r.c_lastName } : null,
        }
        return txn
      })

      // Fetch items for each transaction
      if (transactions.length > 0) {
        const txnIds = transactions.map((t) => t.id)
        const idPlaceholders = txnIds.map(() => '?').join(', ')
        const itemsResult = await turso.execute({
          sql: `SELECT id, transactionId, productId, productName, quantity, unitPrice, subtotal,
                       requiresRx, dispensedQty, sellingUnit, itemsPerUnit, createdAt
                FROM TransactionItem
                WHERE transactionId IN (${idPlaceholders})`,
          args: txnIds,
        })

        const allItems = toObjs(itemsResult)
        const itemsByTxn: Record<string, unknown[]> = {}
        for (const item of allItems) {
          const tid = item.transactionId as string
          if (!itemsByTxn[tid]) itemsByTxn[tid] = []
          itemsByTxn[tid].push({
            id: item.id,
            transactionId: item.transactionId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            requiresRx: bool(item.requiresRx),
            dispensedQty: item.dispensedQty,
            sellingUnit: (item.sellingUnit as string) || 'EA',
            itemsPerUnit: Number(item.itemsPerUnit) || 1,
            createdAt: item.createdAt,
          })
        }
        for (const txn of transactions) {
          txn.items = itemsByTxn[txn.id as string] || []
        }
      }

      return NextResponse.json({
        transactions,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const where: Record<string, unknown> = {}

    if (!isSuperAdmin && requesterId) {
      where.userId = requesterId
    }

    if (from || to) {
      where.createdAt = {} as Record<string, unknown>
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from)
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to)
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

    const skip2 = (page - 1) * limit

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where, skip: skip2, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          customer: { select: { id: true, firstName: true, lastName: true } },
          items: true,
        },
      }),
      db.transaction.count({ where }),
    ])

    return NextResponse.json({
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch transactions', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/transactions  –  create new transaction (complete POS sale)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json(
        { error: 'User authentication required. Please log in and try again.' },
        { status: 401 },
      )
    }

    // ── Shift gate: require an active shift to create a transaction ──
    if (isTurso()) {
      const shiftCheck = await turso.execute({
        sql: `SELECT id FROM "Shift" WHERE "userId" = ? AND status = 'ACTIVE' LIMIT 1`,
        args: [userId],
      })
      if (shiftCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'No active shift. Please start your shift before making sales.' },
          { status: 403 },
        )
      }
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    if (action === 'void') {
      return NextResponse.json(
        { error: 'Use /api/transactions/[id] with POST for voiding' },
        { status: 400 },
      )
    }

    const body = await request.json()
    const {
      customerId, items, paymentMethod, subtotal, tax, discount, total,
      paymentAmount, prescriptionId, notes,
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Transaction items are required' }, { status: 400 })
    }
    if (!paymentMethod) {
      return NextResponse.json({ error: 'Payment method is required' }, { status: 400 })
    }
    if (total === undefined || total === null) {
      return NextResponse.json({ error: 'Transaction total is required' }, { status: 400 })
    }

    if (isTurso()) {
      // 1. Check inventory for all items (read-modify-write pre-check)
      for (const item of items) {
        const effectiveQty = (item.quantity as number) * ((item.itemsPerUnit as number) || 1)
        const invResult = await turso.execute({
          sql: 'SELECT quantity FROM Inventory WHERE productId = ?',
          args: [item.productId],
        })
        const availableQty = invResult.rows.length > 0 ? (invResult.rows[0][0] as number) : 0
        if (availableQty < effectiveQty) {
          // Fetch product name for error message
          const prodResult = await turso.execute({
            sql: 'SELECT name FROM Product WHERE id = ?',
            args: [item.productId],
          })
          const prodName = prodResult.rows.length > 0 ? (prodResult.rows[0][0] as string) : 'product'
          const unitLabel = item.itemsPerUnit && item.itemsPerUnit > 1 ? ` (needs ${effectiveQty} units for ${item.quantity} selling units)` : ''
          return NextResponse.json(
            {
              error: `Insufficient stock for ${prodName} (available: ${availableQty}, requested: ${effectiveQty}${unitLabel})`,
            },
            { status: 400 },
          )
        }
      }

      // 2. Generate transaction number
      const transactionNo = generateTransactionNo()
      const transactionId = generateId()
      const now = new Date().toISOString()

      // 3. Insert Transaction
      await turso.execute({
        sql: `INSERT INTO "Transaction"
              (id, transactionNo, customerId, userId, subtotal, tax, discount, total,
               paymentMethod, paymentAmount, changeAmount, status, prescriptionId, notes, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          transactionId, transactionNo, customerId || null, userId,
          subtotal || 0, tax || 0, discount || 0, total,
          paymentMethod, paymentAmount || total,
          Math.max(0, (paymentAmount || total) - total),
          'COMPLETED', prescriptionId || null, notes || null,
          now, now,
        ],
      })

      // 4. Insert TransactionItems (with sellingUnit/itemsPerUnit for receipt display)
      const itemStmts = items.map((item: Record<string, unknown>) => ({
        sql: `INSERT INTO TransactionItem
              (id, transactionId, productId, productName, quantity, unitPrice, subtotal, requiresRx, dispensedQty, sellingUnit, itemsPerUnit, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          generateId(), transactionId, item.productId, item.productName,
          item.quantity, item.unitPrice, item.subtotal,
          item.requiresRx ? 1 : 0, item.quantity,
          item.sellingUnit || 'EA', item.itemsPerUnit || 1,
          now,
        ],
      }))
      await turso.batch(itemStmts)

      // 5. Decrement inventory for all items — FEFO (First Expired, First Out)
      for (const item of items) {
        const itemQty = (item.quantity as number) * ((item.itemsPerUnit as number) || 1)
        const pid = item.productId as string
        const now2 = new Date().toISOString()

        // Try FEFO: deduct from active (non-expired) batches with earliest expiry first
        const batchResult = await turso.execute({
          sql: `SELECT id, quantity FROM "Batch" WHERE "productId" = ? AND quantity > 0 AND ("expiryDate" IS NULL OR date("expiryDate") > date('now')) ORDER BY "expiryDate" ASC NULLS LAST`,
          args: [pid],
        })

        if (batchResult.rows.length > 0) {
          let remaining = itemQty
          for (const brow of batchResult.rows) {
            if (remaining <= 0) break
            const bId = brow[0] as string
            const bQty = brow[1] as number
            const deduct = Math.min(remaining, bQty)
            await turso.execute({
              sql: 'UPDATE "Batch" SET quantity = ?, "updatedAt" = ? WHERE id = ? AND "productId" = ?',
              args: [bQty - deduct, now2, bId, pid],
            })
            remaining -= deduct
          }
        }

        // Update Inventory total (denormalized)
        const invResult = await turso.execute({
          sql: 'SELECT quantity FROM Inventory WHERE productId = ?',
          args: [pid],
        })
        const currentQty = invResult.rows.length > 0 ? (invResult.rows[0][0] as number) : 0
        await turso.execute({
          sql: 'UPDATE Inventory SET quantity = ?, lastCounted = ?, updatedAt = ? WHERE productId = ?',
          args: [currentQty - itemQty, now2, now2, pid],
        })
      }

      // 6. Return created transaction with user/customer/items
      const txnResult = await turso.execute({
        sql: `SELECT t.id as t_id, t.transactionNo as t_transactionNo, t.customerId as t_customerId,
                      t.userId as t_userId, t.subtotal as t_subtotal, t.tax as t_tax,
                      t.discount as t_discount, t.total as t_total, t.paymentMethod as t_paymentMethod,
                      t.paymentAmount as t_paymentAmount, t.changeAmount as t_changeAmount,
                      t.status as t_status, t.prescriptionId as t_prescriptionId,
                      t.notes as t_notes, t.createdAt as t_createdAt, t.updatedAt as t_updatedAt,
                      u.id as u_id, u.name as u_name, u.email as u_email,
                      c.id as c_id, c.firstName as c_firstName, c.lastName as c_lastName
               FROM "Transaction" t
               LEFT JOIN User u ON t.userId = u.id
               LEFT JOIN Customer c ON t.customerId = c.id
               WHERE t.id = ?`,
        args: [transactionId],
      })
      const txnRow = toObjs(txnResult)[0]

      const itemsResult = await turso.execute({
        sql: `SELECT id, transactionId, productId, productName, quantity, unitPrice, subtotal,
                       requiresRx, dispensedQty, sellingUnit, itemsPerUnit, createdAt
                FROM TransactionItem WHERE transactionId = ?`,
        args: [transactionId],
      })

      const transaction = {
        id: txnRow.t_id,
        transactionNo: txnRow.t_transactionNo,
        customerId: txnRow.t_customerId,
        userId: txnRow.t_userId,
        subtotal: txnRow.t_subtotal,
        tax: txnRow.t_tax,
        discount: txnRow.t_discount,
        total: txnRow.t_total,
        paymentMethod: txnRow.t_paymentMethod,
        paymentAmount: txnRow.t_paymentAmount,
        changeAmount: txnRow.t_changeAmount,
        status: txnRow.t_status,
        prescriptionId: txnRow.t_prescriptionId,
        notes: txnRow.t_notes,
        createdAt: txnRow.t_createdAt,
        updatedAt: txnRow.t_updatedAt,
        user: txnRow.u_id ? { id: txnRow.u_id, name: txnRow.u_name, email: txnRow.u_email } : null,
        customer: txnRow.c_id ? { id: txnRow.c_id, firstName: txnRow.c_firstName, lastName: txnRow.c_lastName } : null,
        items: toObjs(itemsResult).map((i) => ({
          id: i.id, transactionId: i.transactionId, productId: i.productId,
          productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice,
          subtotal: i.subtotal, requiresRx: bool(i.requiresRx), dispensedQty: i.dispensedQty,
          sellingUnit: (i.sellingUnit as string) || 'EA',
          itemsPerUnit: Number(i.itemsPerUnit) || 1,
          createdAt: i.createdAt,
        })),
      }

      return NextResponse.json(transaction, { status: 201 })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')

    // Check inventory for all items and deduct
    for (const item of items) {
      const effectiveQty = (item.quantity as number) * ((item.itemsPerUnit as number) || 1)
      const inventory = await db.inventory.findUnique({ where: { productId: item.productId } })
      if (!inventory || inventory.quantity < effectiveQty) {
        const product = await db.product.findUnique({ where: { id: item.productId } })
        return NextResponse.json(
          {
            error: `Insufficient stock for ${product?.name || 'product'} (available: ${inventory?.quantity || 0}, requested: ${effectiveQty})`,
          },
          { status: 400 },
        )
      }
    }

    const transactionNo = generateTransactionNo()

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
        user: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        items: true,
      },
    })

    // Deduct inventory for all items (multiply by itemsPerUnit for strip/blister sales)
    for (const item of items) {
      const effectiveQty = (item.quantity as number) * ((item.itemsPerUnit as number) || 1)
      await db.inventory.update({
        where: { productId: item.productId as string },
        data: { quantity: { decrement: effectiveQty }, lastCounted: new Date() },
      })
    }

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    console.error('Error creating transaction:', error)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}
