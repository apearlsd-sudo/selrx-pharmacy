import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ---------------------------------------------------------------------------
// GET /api/transactions/suspended/[id]  –  get single suspended cart
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id } = await params
    const requesterRole = request.headers.get('x-user-role') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    if (isTurso()) {
      const whereClause = isSuperAdmin ? 'id = ?' : '"userId" = ? AND id = ?'
      const args = isSuperAdmin ? [id] : [userId, id]

      const result = await tursoExecute({
        sql: `SELECT * FROM "SuspendedCart" WHERE ${whereClause}`,
        args,
      })

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Suspended cart not found' }, { status: 404 })
      }

      const columns = result.columns
      const cart: Record<string, unknown> = {}
      columns.forEach((c, i) => { cart[c] = result.rows[0][i] })
      try { cart.items = JSON.parse(cart.items as string) } catch { cart.items = [] }

      return NextResponse.json(cart)
    }

    const { db } = await import('@/lib/db')
    const carts = await db.$queryRawUnsafe(
      `SELECT * FROM "SuspendedCart" WHERE ${isSuperAdmin ? 'id = ?' : '"userId" = ? AND id = ?'}`,
      ...(isSuperAdmin ? [id] : [userId, id])
    ) as Array<Record<string, unknown>>

    if (!carts || carts.length === 0) {
      return NextResponse.json({ error: 'Suspended cart not found' }, { status: 404 })
    }

    const cart = carts[0]
    try { cart.items = JSON.parse(cart.items as string) } catch { cart.items = [] }
    return NextResponse.json(cart)
  } catch (error) {
    console.error('Error fetching suspended cart:', error)
    return NextResponse.json({ error: 'Failed to fetch suspended cart' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/transactions/suspended/[id]  –  recall (load back into POS)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id } = await params
    const requesterRole = request.headers.get('x-user-role') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    if (isTurso()) {
      // Fetch the cart first
      const whereClause = isSuperAdmin ? 'id = ?' : '"userId" = ? AND id = ?'
      const args = isSuperAdmin ? [id] : [userId, id]

      const result = await tursoExecute({
        sql: `SELECT * FROM "SuspendedCart" WHERE ${whereClause}`,
        args,
      })

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Suspended cart not found' }, { status: 404 })
      }

      const columns = result.columns
      const cart: Record<string, unknown> = {}
      columns.forEach((c, i) => { cart[c] = result.rows[0][i] })
      try { cart.items = JSON.parse(cart.items as string) } catch { cart.items = [] }

      // Delete it after successful fetch (recall = remove from suspended)
      await tursoExecute({
        sql: `DELETE FROM "SuspendedCart" WHERE id = ?`,
        args: [id],
      })

      const { ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId, action: 'CART_RECALLED', category: 'transaction', entity: 'SuspendedCart', entityId: id,
        details: { itemCount: (cart.items as unknown[]).length, total: cart.total }, ipAddress, userAgent })

      return NextResponse.json(cart)
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const carts = await db.$queryRawUnsafe(
      `SELECT * FROM "SuspendedCart" WHERE ${isSuperAdmin ? 'id = ?' : '"userId" = ? AND id = ?'}`,
      ...(isSuperAdmin ? [id] : [userId, id])
    ) as Array<Record<string, unknown>>

    if (!carts || carts.length === 0) {
      return NextResponse.json({ error: 'Suspended cart not found' }, { status: 404 })
    }

    const cart = carts[0]
    try { cart.items = JSON.parse(cart.items as string) } catch { cart.items = [] }

    await db.$executeRawUnsafe(`DELETE FROM "SuspendedCart" WHERE id = ?`, id)

    const { ipAddress, userAgent } = getRequestContext(request)
    writeAuditLog({ userId, action: 'CART_RECALLED', category: 'transaction', entity: 'SuspendedCart', entityId: id,
      details: { itemCount: (cart.items as unknown[]).length, total: cart.total }, ipAddress, userAgent })

    return NextResponse.json(cart)
  } catch (error) {
    console.error('Error recalling cart:', error)
    return NextResponse.json({ error: 'Failed to recall cart' }, { status: 500 })
  }
}
