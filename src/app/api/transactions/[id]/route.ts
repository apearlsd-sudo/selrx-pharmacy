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

const bool = (v: unknown): boolean => v === 1 || v === true

// ---------------------------------------------------------------------------
// GET /api/transactions/[id]
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    // RBAC
    const requesterRole = request.headers.get('x-user-role') || ''
    const requesterId = request.headers.get('x-user-id') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    if (isTurso()) {
      // Fetch transaction with JOINs to User, Customer, Prescription, HardwareLog
      const txnResult = await turso.execute({
        sql: `SELECT t.id as t_id, t.transactionNo as t_transactionNo, t.customerId as t_customerId,
                      t.userId as t_userId, t.subtotal as t_subtotal, t.tax as t_tax,
                      t.discount as t_discount, t.total as t_total, t.paymentMethod as t_paymentMethod,
                      t.paymentAmount as t_paymentAmount, t.changeAmount as t_changeAmount,
                      t.status as t_status, t.prescriptionId as t_prescriptionId,
                      t.notes as t_notes, t.createdAt as t_createdAt, t.updatedAt as t_updatedAt,
                      u.id as u_id, u.name as u_name, u.email as u_email, u.role as u_role,
                      c.id as c_id, c.firstName as c_firstName, c.lastName as c_lastName,
                      c.email as c_email, c.phone as c_phone,
                      pr.id as pr_id, pr.rxNumber as pr_rxNumber, pr.productName as pr_productName,
                      hl.id as hl_id, hl.hardwareType as hl_hardwareType, hl.action as hl_action,
                      hl.status as hl_status, hl.details as hl_details, hl.createdAt as hl_createdAt
               FROM "Transaction" t
               LEFT JOIN User u ON t.userId = u.id
               LEFT JOIN Customer c ON t.customerId = c.id
               LEFT JOIN Prescription pr ON t.prescriptionId = pr.id
               LEFT JOIN HardwareLog hl ON t.id = hl.transactionId
               WHERE t.id = ?`,
        args: [id],
      })

      if (txnResult.rows.length === 0) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      }

      const r = toObjs(txnResult)[0]

      // Non-SUPER_ADMIN can only view their own transactions
      if (!isSuperAdmin && requesterId && r.t_userId !== requesterId) {
        return NextResponse.json(
          { error: 'You do not have permission to view this transaction' },
          { status: 403 },
        )
      }

      // Fetch TransactionItems with Product details
      const itemsResult = await turso.execute({
        sql: `SELECT ti.id as ti_id, ti.transactionId as ti_transactionId,
                      ti.productId as ti_productId, ti.productName as ti_productName,
                      ti.quantity as ti_quantity, ti.unitPrice as ti_unitPrice,
                      ti.subtotal as ti_subtotal, ti.requiresRx as ti_requiresRx,
                      ti.dispensedQty as ti_dispensedQty, ti.createdAt as ti_createdAt,
                      p.id as p_id, p.name as p_name, p.ndc as p_ndc,
                      p.dosageForm as p_dosageForm, p.strength as p_strength
               FROM TransactionItem ti
               LEFT JOIN Product p ON ti.productId = p.id
               WHERE ti.transactionId = ?`,
        args: [id],
      })

      const transaction = {
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
        user: r.u_id
          ? { id: r.u_id, name: r.u_name, email: r.u_email, role: r.u_role }
          : null,
        customer: r.c_id
          ? { id: r.c_id, firstName: r.c_firstName, lastName: r.c_lastName, email: r.c_email, phone: r.c_phone }
          : null,
        prescription: r.pr_id
          ? { id: r.pr_id, rxNumber: r.pr_rxNumber, productName: r.pr_productName }
          : null,
        hardwareLog: r.hl_id
          ? { id: r.hl_id, transactionId: id, hardwareType: r.hl_hardwareType, action: r.hl_action, status: r.hl_status, details: r.hl_details, createdAt: r.hl_createdAt }
          : null,
        items: toObjs(itemsResult).map((i) => ({
          id: i.ti_id,
          transactionId: i.ti_transactionId,
          productId: i.ti_productId,
          productName: i.ti_productName,
          quantity: i.ti_quantity,
          unitPrice: i.ti_unitPrice,
          subtotal: i.ti_subtotal,
          requiresRx: bool(i.ti_requiresRx),
          dispensedQty: i.ti_dispensedQty,
          createdAt: i.ti_createdAt,
          product: i.p_id
            ? { id: i.p_id, name: i.p_name, ndc: i.p_ndc, dosageForm: i.p_dosageForm, strength: i.p_strength }
            : null,
        })),
      }

      return NextResponse.json(transaction)
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const transaction = await db.transaction.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        prescription: { select: { id: true, rxNumber: true, productName: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, ndc: true, dosageForm: true, strength: true } },
          },
        },
        hardwareLog: true,
      },
    })

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (!isSuperAdmin && requesterId && transaction.userId !== requesterId) {
      return NextResponse.json(
        { error: 'You do not have permission to view this transaction' },
        { status: 403 },
      )
    }

    return NextResponse.json(transaction)
  } catch (error) {
    console.error('Error fetching transaction:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch transaction', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/transactions/[id]/void  –  void a transaction (restore inventory)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'PHARMACIST' && role !== 'SUPER_ADMIN' && role !== 'CASHIER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action !== 'void') {
      return NextResponse.json(
        { error: 'Invalid action. Use ?action=void to void a transaction.' },
        { status: 400 },
      )
    }

    if (isTurso()) {
      // 1. Check transaction exists and its status
      const txnResult = await turso.execute({
        sql: 'SELECT status FROM "Transaction" WHERE id = ?',
        args: [id],
      })

      if (txnResult.rows.length === 0) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      }

      const status = txnResult.rows[0][0] as string
      if (status === 'VOIDED') {
        return NextResponse.json({ error: 'Transaction is already voided' }, { status: 400 })
      }
      if (status !== 'COMPLETED') {
        return NextResponse.json(
          { error: 'Only completed transactions can be voided' },
          { status: 400 },
        )
      }

      // 2. Get all transaction items
      const itemsResult = await turso.execute({
        sql: 'SELECT productId, quantity FROM TransactionItem WHERE transactionId = ?',
        args: [id],
      })
      const items = toObjs(itemsResult)

      // 3. Restore inventory for each item (read-modify-write: SELECT then UPDATE)
      const now = new Date().toISOString()
      for (const item of items) {
        const pid = item.productId
        const restoreQty = item.quantity as number

        // Restore to the batch with nearest expiry (most likely the one it came from)
        const batchResult = await turso.execute({
          sql: `SELECT id FROM "Batch" WHERE "productId" = ? ORDER BY "expiryDate" ASC NULLS LAST LIMIT 1`,
          args: [pid],
        })
        if (batchResult.rows.length > 0) {
          await turso.execute({
            sql: 'UPDATE "Batch" SET quantity = quantity + ?, "updatedAt" = ? WHERE id = ? AND "productId" = ?',
            args: [restoreQty, now, batchResult.rows[0][0], pid],
          })
        }

        // Update Inventory total
        const invResult = await turso.execute({
          sql: 'SELECT quantity FROM Inventory WHERE productId = ?',
          args: [pid],
        })
        const currentQty = invResult.rows.length > 0 ? (invResult.rows[0][0] as number) : 0
        await turso.execute({
          sql: 'UPDATE Inventory SET quantity = ?, lastCounted = ?, updatedAt = ? WHERE productId = ?',
          args: [currentQty + restoreQty, now, now, pid],
        })
      }

      // 4. Update transaction status to VOIDED
      await turso.execute({
        sql: "UPDATE \"Transaction\" SET status = 'VOIDED', updatedAt = ? WHERE id = ?",
        args: [now, id],
      })

      // 5. Fetch updated transaction with user/customer/items for response
      const voidedResult = await turso.execute({
        sql: `SELECT t.id as t_id, t.transactionNo as t_transactionNo, t.customerId as t_customerId,
                      t.userId as t_userId, t.subtotal as t_subtotal, t.tax as t_tax,
                      t.discount as t_discount, t.total as t_total, t.paymentMethod as t_paymentMethod,
                      t.paymentAmount as t_paymentAmount, t.changeAmount as t_changeAmount,
                      t.status as t_status, t.prescriptionId as t_prescriptionId,
                      t.notes as t_notes, t.createdAt as t_createdAt, t.updatedAt as t_updatedAt,
                      u.id as u_id, u.name as u_name,
                      c.id as c_id, c.firstName as c_firstName, c.lastName as c_lastName
               FROM "Transaction" t
               LEFT JOIN User u ON t.userId = u.id
               LEFT JOIN Customer c ON t.customerId = c.id
               WHERE t.id = ?`,
        args: [id],
      })
      const vr = toObjs(voidedResult)[0]

      // Re-fetch items
      const voidedItems = await turso.execute({
        sql: `SELECT id, transactionId, productId, productName, quantity, unitPrice, subtotal,
                       requiresRx, dispensedQty, createdAt
                FROM TransactionItem WHERE transactionId = ?`,
        args: [id],
      })

      const voided = {
        id: vr.t_id,
        transactionNo: vr.t_transactionNo,
        customerId: vr.t_customerId,
        userId: vr.t_userId,
        subtotal: vr.t_subtotal,
        tax: vr.t_tax,
        discount: vr.t_discount,
        total: vr.t_total,
        paymentMethod: vr.t_paymentMethod,
        paymentAmount: vr.t_paymentAmount,
        changeAmount: vr.t_changeAmount,
        status: vr.t_status,
        prescriptionId: vr.t_prescriptionId,
        notes: vr.t_notes,
        createdAt: vr.t_createdAt,
        updatedAt: vr.t_updatedAt,
        user: vr.u_id ? { id: vr.u_id, name: vr.u_name } : null,
        customer: vr.c_id ? { id: vr.c_id, firstName: vr.c_firstName, lastName: vr.c_lastName } : null,
        items: toObjs(voidedItems).map((i) => ({
          id: i.id, transactionId: i.transactionId, productId: i.productId,
          productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice,
          subtotal: i.subtotal, requiresRx: bool(i.requiresRx), dispensedQty: i.dispensedQty,
          createdAt: i.createdAt,
        })),
      }

      return NextResponse.json({
        message: 'Transaction voided successfully',
        transaction: voided,
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const transaction = await db.transaction.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (transaction.status === 'VOIDED') {
      return NextResponse.json({ error: 'Transaction is already voided' }, { status: 400 })
    }

    if (transaction.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Only completed transactions can be voided' },
        { status: 400 },
      )
    }

    // Restore inventory for all items
    for (const item of transaction.items) {
      await db.inventory.update({
        where: { productId: item.productId },
        data: { quantity: { increment: item.quantity }, lastCounted: new Date() },
      })
    }

    // Update transaction status to VOIDED
    const voided = await db.transaction.update({
      where: { id },
      data: { status: 'VOIDED' },
      include: {
        user: { select: { id: true, name: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        items: true,
      },
    })

    return NextResponse.json({
      message: 'Transaction voided successfully',
      transaction: voided,
    })
  } catch (error) {
    console.error('Error voiding transaction:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to void transaction', detail: msg }, { status: 500 })
  }
}
