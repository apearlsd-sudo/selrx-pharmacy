import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, toObjs } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'
import { ensurePOTables } from '@/lib/ensure-po-tables'

// ---------------------------------------------------------------------------
// GET /api/purchase-orders — list POs with pagination, status filter, search
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    if (isTurso()) await ensurePOTables()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    if (isTurso()) {
      const conditions: string[] = []
      const args: any[] = []

      if (status && status !== 'ALL') {
        conditions.push('po.status = ?')
        args.push(status)
      }
      if (search) {
        conditions.push(
          '(po.vendorName LIKE \'%\' || ? || \'%\' OR po.id LIKE \'%\' || ? || \'%\' OR po.notes LIKE \'%\' || ? || \'%\')'
        )
        args.push(search, search, search)
      }
      if (from) { conditions.push('po."createdAt" >= ?'); args.push(from) }
      if (to) { conditions.push('po."createdAt" <= ?'); args.push(to + 'T23:59:59') }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
      const offset = (page - 1) * limit

      // Fetch paginated POs with items count
      const result = await turso.execute({
        sql: `SELECT po.*, v.name AS vendor_name, v.phone AS vendor_phone,
                    (SELECT COUNT(*) FROM "PurchaseOrderItem" poi WHERE poi."orderId" = po.id) AS items_count
             FROM "PurchaseOrder" po
             LEFT JOIN "Vendor" v ON v.id = po."vendorId"
             ${whereClause}
             ORDER BY po."createdAt" DESC
             LIMIT ? OFFSET ?`,
        args: [...args, limit, offset],
      })

      const orders = toObjs(result).map((row) => ({
        id: row.id,
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        status: row.status,
        notes: row.notes,
        expectedDate: row.expectedDate,
        totalAmount: Number(row.totalAmount),
        receivedAmount: Number(row.receivedAmount),
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        vendor: row.vendor_name ? { name: row.vendor_name, phone: row.vendor_phone } : null,
        _count: { items: Number(row.items_count) },
      }))

      // Total count
      const countResult = await turso.execute({
        sql: `SELECT COUNT(*) AS cnt FROM "PurchaseOrder" po ${whereClause}`,
        args,
      })
      const total = Number(toObjs(countResult)[0]?.cnt ?? 0)

      // Status counts (for tabs) - no filters
      const statusCountsResult = await turso.execute({
        sql: `SELECT status, COUNT(*) AS cnt FROM "PurchaseOrder" GROUP BY status`,
        args: [],
      })
      const statusCounts: Record<string, number> = {}
      for (const row of toObjs(statusCountsResult)) {
        statusCounts[row.status as string] = Number(row.cnt)
      }

      return NextResponse.json({
        orders,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        statusCounts,
      })
    }

    // ---- Prisma fallback ----
    const { db } = await import('@/lib/db')
    const where: Record<string, unknown> = {}
    if (status && status !== 'ALL') { where.status = status }
    if (search) {
      where.OR = [
        { vendorName: { contains: search } },
        { id: { contains: search } },
        { notes: { contains: search } },
      ]
    }
    if (from || to) {
      where.createdAt = {} as Record<string, unknown>
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from)
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to)
    }

    const [orders, total, allOrders] = await Promise.all([
      db.purchaseOrder.findMany({
        where,
        include: {
          vendor: { select: { name: true, phone: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.purchaseOrder.count({ where }),
      db.purchaseOrder.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
    ])

    const statusCounts: Record<string, number> = {}
    for (const row of allOrders) {
      statusCounts[row.status] = row._count.status
    }

    return NextResponse.json({
      orders,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      statusCounts,
    })
  } catch (error) {
    console.error('GET /api/purchase-orders error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch purchase orders', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/purchase-orders — create a new PO with items
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    if (isTurso()) await ensurePOTables()
    const body = await req.json()
    const { vendorId, vendorName, expectedDate, notes, items } = body

    if (!vendorName || !vendorName.trim()) {
      return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }
    for (const item of items) {
      if (!item.productId || !item.productName || !item.quantity || item.unitCost == null) {
        return NextResponse.json({ error: 'Each item must have productId, productName, quantity, and unitCost' }, { status: 400 })
      }
    }

    const totalAmount = items.reduce((sum: number, item: { quantity: number; unitCost: number }) => {
      return sum + (Number(item.quantity) * Number(item.unitCost))
    }, 0)

    const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(req)
    const now = new Date().toISOString()

    if (isTurso()) {
      const orderId = generateId()

      // Insert PO
      await turso.execute({
        sql: `INSERT INTO "PurchaseOrder" (id, "vendorId", vendorName, status, notes, "expectedDate", "totalAmount", "receivedAmount", "createdBy", "createdAt", "updatedAt")
             VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, 0, ?, ?, ?)`,
        args: [
          orderId,
          vendorId || null,
          vendorName.trim(),
          notes || null,
          expectedDate || null,
          totalAmount,
          auditUserId,
          now,
          now,
        ],
      })

      // Insert items
      for (const item of items) {
        const itemId = generateId()
        await turso.execute({
          sql: `INSERT INTO "PurchaseOrderItem" (id, "orderId", "productId", productName, quantity, "receivedQty", "unitCost", "createdAt")
                 VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
          args: [itemId, orderId, item.productId, item.productName, Number(item.quantity), Number(item.unitCost), now],
        })
      }

      await writeAuditLog({
        userId: auditUserId,
        action: 'PO_CREATED',
        category: 'purchase',
        entity: 'PurchaseOrder',
        entityId: orderId,
        details: { vendorName, itemCount: items.length, totalAmount },
        ipAddress,
        userAgent,
      })

      return NextResponse.json({ order: { id: orderId, status: 'DRAFT', totalAmount } }, { status: 201 })
    }

    // ---- Prisma fallback ----
    const { db } = await import('@/lib/db')
    const order = await db.purchaseOrder.create({
      data: {
        vendorId: vendorId || null,
        vendorName: vendorName.trim(),
        status: 'DRAFT',
        notes: notes || null,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        totalAmount,
        receivedAmount: 0,
        createdBy: auditUserId,
        items: {
          create: items.map((item: { productId: string; productName: string; quantity: number; unitCost: number }) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: Number(item.quantity),
            receivedQty: 0,
            unitCost: Number(item.unitCost),
          })),
        },
      },
      include: { items: true },
    })

    await writeAuditLog({
      userId: auditUserId,
      action: 'PO_CREATED',
      category: 'purchase',
      entity: 'PurchaseOrder',
      entityId: order.id,
      details: { vendorName, itemCount: items.length, totalAmount },
      ipAddress,
      userAgent,
    })

    return NextResponse.json({ order }, { status: 201 })
  } catch (error) {
    console.error('POST /api/purchase-orders error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to create purchase order', detail: msg }, { status: 500 })
  }
}
