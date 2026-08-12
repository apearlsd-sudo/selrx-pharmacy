import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'
import { ensurePOTables } from '@/lib/ensure-po-tables'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toObjs(result: { columns: Array<string>; rows: Array<Array<unknown>> }) {
  const names = result.columns.map((c) => c)
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((n, i) => { obj[n] = row[i] })
    return obj
  })
}

// ---------------------------------------------------------------------------
// GET /api/purchase-orders/[id] — get single PO with items
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (isTurso()) await ensurePOTables()

    if (isTurso()) {
      // Fetch PO
      const poResult = await turso.execute({
        sql: `SELECT po.*, v.name AS vendor_name, v.phone AS vendor_phone, v.email AS vendor_email
             FROM "PurchaseOrder" po
             LEFT JOIN "Vendor" v ON v.id = po."vendorId"
             WHERE po.id = ?`,
        args: [id],
      })
      if (poResult.rows.length === 0) {
        return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
      }
      const po = toObjs(poResult)[0]

      // Fetch items
      const itemsResult = await turso.execute({
        sql: `SELECT * FROM "PurchaseOrderItem" WHERE "orderId" = ? ORDER BY "createdAt" ASC`,
        args: [id],
      })
      const items = toObjs(itemsResult).map((row) => ({
        id: row.id,
        orderId: row.orderId,
        productId: row.productId,
        productName: row.productName,
        quantity: Number(row.quantity),
        receivedQty: Number(row.receivedQty),
        unitCost: Number(row.unitCost),
        createdAt: row.createdAt,
      }))

      return NextResponse.json({
        order: {
          id: po.id,
          vendorId: po.vendorId,
          vendorName: po.vendorName,
          status: po.status,
          notes: po.notes,
          expectedDate: po.expectedDate,
          totalAmount: Number(po.totalAmount),
          receivedAmount: Number(po.receivedAmount),
          createdBy: po.createdBy,
          createdAt: po.createdAt,
          updatedAt: po.updatedAt,
          vendor: po.vendor_name ? { name: po.vendor_name, phone: po.vendor_phone, email: po.vendor_email } : null,
          items,
        },
      })
    }

    // ---- Prisma fallback ----
    const { db } = await import('@/lib/db')
    const order = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: { select: { name: true, phone: true, email: true } },
        items: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!order) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }
    return NextResponse.json({ order })
  } catch (error) {
    console.error('GET /api/purchase-orders/[id] error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch purchase order', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT /api/purchase-orders/[id] — update PO (notes, expectedDate, status, vendorName)
// ---------------------------------------------------------------------------

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { notes, expectedDate, status, vendorName } = body

    const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(req)
    const now = new Date().toISOString()
    if (isTurso()) await ensurePOTables()

    if (isTurso()) {
      // Check PO exists
      const existing = await turso.execute({
        sql: `SELECT id, status FROM "PurchaseOrder" WHERE id = ?`,
        args: [id],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
      }
      const currentStatus = existing.rows[0].status as string

      // Build dynamic update
      const setClauses: string[] = [`"updatedAt" = ?`]
      const args: unknown[] = [now]

      if (notes !== undefined) { setClauses.push(`notes = ?`); args.push(notes || null) }
      if (expectedDate !== undefined) { setClauses.push(`"expectedDate" = ?`); args.push(expectedDate || null) }
      if (vendorName !== undefined) { setClauses.push(`vendorName = ?`); args.push(vendorName) }
      if (status !== undefined) {
        // Validate status transitions
        const validTransitions: Record<string, string[]> = {
          DRAFT: ['SENT', 'CANCELLED'],
          SENT: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
          PARTIALLY_RECEIVED: ['RECEIVED', 'CANCELLED'],
        }
        const allowed = validTransitions[currentStatus]
        if (!allowed || !allowed.includes(status)) {
          return NextResponse.json(
            { error: `Cannot transition from ${currentStatus} to ${status}` },
            { status: 400 }
          )
        }
        setClauses.push(`status = ?`)
        args.push(status)
      }

      args.push(id) // WHERE clause
      await turso.execute({
        sql: `UPDATE "PurchaseOrder" SET ${setClauses.join(', ')} WHERE id = ?`,
        args,
      })

      // Audit log for status changes
      if (status === 'SENT') {
        await writeAuditLog({ userId: auditUserId, action: 'PO_SENT', category: 'purchase', entity: 'PurchaseOrder', entityId: id, ipAddress, userAgent })
      }
      if (status === 'CANCELLED') {
        await writeAuditLog({ userId: auditUserId, action: 'PO_CANCELLED', category: 'purchase', entity: 'PurchaseOrder', entityId: id, details: { previousStatus: currentStatus }, ipAddress, userAgent })
      }

      // Fetch updated PO
      const updated = await turso.execute({
        sql: `SELECT * FROM "PurchaseOrder" WHERE id = ?`,
        args: [id],
      })
      const row = toObjs(updated)[0]
      return NextResponse.json({
        order: {
          id: row.id, vendorId: row.vendorId, vendorName: row.vendorName,
          status: row.status, notes: row.notes, expectedDate: row.expectedDate,
          totalAmount: Number(row.totalAmount), receivedAmount: Number(row.receivedAmount),
          createdBy: row.createdBy, createdAt: row.createdAt, updatedAt: row.updatedAt,
        },
      })
    }

    // ---- Prisma fallback ----
    const { db } = await import('@/lib/db')
    const existing = await db.purchaseOrder.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    const validTransitions: Record<string, string[]> = {
      DRAFT: ['SENT', 'CANCELLED'],
      SENT: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
      PARTIALLY_RECEIVED: ['RECEIVED', 'CANCELLED'],
    }
    if (status) {
      const allowed = validTransitions[existing.status]
      if (!allowed || !allowed.includes(status)) {
        return NextResponse.json(
          { error: `Cannot transition from ${existing.status} to ${status}` },
          { status: 400 }
        )
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (notes !== undefined) updateData.notes = notes || null
    if (expectedDate !== undefined) updateData.expectedDate = expectedDate ? new Date(expectedDate) : null
    if (vendorName !== undefined) updateData.vendorName = vendorName
    if (status !== undefined) updateData.status = status

    const order = await db.purchaseOrder.update({ where: { id }, data: updateData })

    if (status === 'SENT') {
      await writeAuditLog({ userId: auditUserId, action: 'PO_SENT', category: 'purchase', entity: 'PurchaseOrder', entityId: id, ipAddress, userAgent })
    }
    if (status === 'CANCELLED') {
      await writeAuditLog({ userId: auditUserId, action: 'PO_CANCELLED', category: 'purchase', entity: 'PurchaseOrder', entityId: id, details: { previousStatus: existing.status }, ipAddress, userAgent })
    }

    return NextResponse.json({ order })
  } catch (error) {
    console.error('PUT /api/purchase-orders/[id] error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to update purchase order', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/purchase-orders/[id] — only if DRAFT
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(req)
    if (isTurso()) await ensurePOTables()

    if (isTurso()) {
      const existing = await turso.execute({
        sql: `SELECT id, status, vendorName FROM "PurchaseOrder" WHERE id = ?`,
        args: [id],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
      }
      const po = toObjs(existing)[0]

      // Delete items first (cascade should handle, but be explicit)
      await turso.execute({ sql: `DELETE FROM "PurchaseOrderItem" WHERE "orderId" = ?`, args: [id] })
      await turso.execute({ sql: `DELETE FROM "PurchaseOrder" WHERE id = ?`, args: [id] })

      await writeAuditLog({
        userId: auditUserId, action: 'PO_DELETED', category: 'purchase',
        entity: 'PurchaseOrder', entityId: id,
        details: { vendorName: po.vendorName },
        ipAddress, userAgent,
      })

      return NextResponse.json({ success: true })
    }

    // ---- Prisma fallback ----
    const { db } = await import('@/lib/db')
    const existing = await db.purchaseOrder.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }
    await db.purchaseOrder.delete({ where: { id } })

    await writeAuditLog({
      userId: auditUserId, action: 'PO_DELETED', category: 'purchase',
      entity: 'PurchaseOrder', entityId: id,
      details: { vendorName: existing.vendorName },
      ipAddress, userAgent,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/purchase-orders/[id] error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to delete purchase order', detail: msg }, { status: 500 })
  }
}
