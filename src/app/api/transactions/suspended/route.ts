import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ---------------------------------------------------------------------------
// GET /api/transactions/suspended  –  list user's suspended carts
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const requesterRole = request.headers.get('x-user-role') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    if (isTurso()) {
      // Ensure table exists
      try {
        await turso.execute(`CREATE TABLE IF NOT EXISTS "SuspendedCart" (
          id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "workstationId" TEXT,
          "customerId" TEXT, "customerName" TEXT, items TEXT NOT NULL,
          subtotal REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL DEFAULT 0, note TEXT,
          "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
          "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
        )`)
      } catch { /* non-fatal */ }

      const whereClause = isSuperAdmin ? '' : 'WHERE "userId" = ?'
      const args = isSuperAdmin ? [] : [userId]

      const result = await turso.execute({
        sql: `SELECT * FROM "SuspendedCart" ${whereClause} ORDER BY "createdAt" DESC LIMIT 50`,
        args,
      })

      const columns = result.columns
      const carts = result.rows.map((row) => {
        const obj: Record<string, unknown> = {}
        columns.forEach((c, i) => { obj[c] = row[i] })
        // Parse JSON items
        try { obj.items = JSON.parse(obj.items as string) } catch { obj.items = [] }
        return obj
      })

      return NextResponse.json({ carts, count: carts.length })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const where = isSuperAdmin ? {} : { userId }
    // SuspendedCart is not a Prisma model, use raw query
    const carts = await db.$queryRawUnsafe(
      `SELECT * FROM "SuspendedCart" ${isSuperAdmin ? '' : 'WHERE "userId" = ?'} ORDER BY "createdAt" DESC LIMIT 50`,
      ...(isSuperAdmin ? [] : [userId])
    ) as Array<Record<string, unknown>>

    for (const cart of carts) {
      try { cart.items = JSON.parse(cart.items as string) } catch { cart.items = [] }
    }

    return NextResponse.json({ carts, count: carts.length })
  } catch (error) {
    console.error('Error fetching suspended carts:', error)
    return NextResponse.json({ error: 'Failed to fetch suspended carts' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/transactions/suspended  –  delete a suspended cart
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Cart ID is required' }, { status: 400 })
    }

    const requesterRole = request.headers.get('x-user-role') || ''
    const isSuperAdmin = requesterRole === 'SUPER_ADMIN'

    if (isTurso()) {
      // Non-admin can only delete their own
      const whereClause = isSuperAdmin ? 'id = ?' : '"userId" = ? AND id = ?'
      const args = isSuperAdmin ? [id] : [userId, id]

      await tursoExecute({
        sql: `DELETE FROM "SuspendedCart" WHERE ${whereClause}`,
        args,
      })
    } else {
      const { db } = await import('@/lib/db')
      await db.$executeRawUnsafe(
        `DELETE FROM "SuspendedCart" WHERE ${isSuperAdmin ? 'id = ?' : '"userId" = ? AND id = ?'}`,
        ...(isSuperAdmin ? [id] : [userId, id])
      )
    }

    const { ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({ userId, action: 'SUSPENDED_CART_DELETED', category: 'transaction', entity: 'SuspendedCart', entityId: id, ipAddress, userAgent })

    return NextResponse.json({ message: 'Suspended cart deleted' })
  } catch (error) {
    console.error('Error deleting suspended cart:', error)
    return NextResponse.json({ error: 'Failed to delete suspended cart' }, { status: 500 })
  }
}
