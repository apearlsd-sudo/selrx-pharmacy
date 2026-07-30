import { NextResponse } from 'next/server'
import { turso, isTurso, safeArgs } from '@/lib/turso'

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

interface Notification {
  id: string
  type: 'expiry' | 'low-stock'
  title: string
  message: string
  productName: string
  productId: string
  severity: 'warning' | 'danger'
  meta: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// GET /api/notifications
// Returns near-expiry (14 days) and low-stock notifications
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    if (isTurso()) {
      const [expiringResult, lowStockResult] = await Promise.all([
        // Products expiring within 14 days (still have stock > 0, not yet expired)
        turso.execute({
          sql: `SELECT p.id, p.name, p.expiryDate, i.quantity,
                       p.sellingPrice, p.category, p.batchNumber
                FROM Product p
                JOIN Inventory i ON p.id = i.productId
                WHERE p.expiryDate IS NOT NULL
                  AND p.expiryDate != ''
                  AND i.quantity > 0
                  AND date(p.expiryDate) >= date('now')
                  AND date(p.expiryDate) <= date('now', '+14 days')
                ORDER BY date(p.expiryDate) ASC`,
          args: [],
        }),

        // Products at or below reorder point
        turso.execute({
          sql: `SELECT p.id, p.name, i.quantity, p.reorderPoint,
                       p.sellingPrice, p.category, p.batchNumber
                FROM Product p
                JOIN Inventory i ON p.id = i.productId
                WHERE p.reorderPoint IS NOT NULL
                  AND i.quantity <= p.reorderPoint
                ORDER BY i.quantity ASC`,
          args: [],
        }),
      ])

      const notifications: Notification[] = []

      // Process expiry notifications
      for (const r of toObjs(expiringResult)) {
        const expDate = r.expiryDate as string
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const expiry = new Date(expDate)
        expiry.setHours(0, 0, 0, 0)
        const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        notifications.push({
          id: `exp-${r.id}`,
          type: 'expiry',
          title: daysLeft <= 3 ? 'Urgent: Expiring Soon' : 'Expiring Soon',
          message: `${r.name} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
          productName: r.name as string,
          productId: r.id as string,
          severity: daysLeft <= 3 ? 'danger' : 'warning',
          meta: { daysLeft, expiryDate: expDate, quantity: r.quantity, category: r.category, batchNumber: r.batchNumber },
        })
      }

      // Process low-stock notifications
      for (const r of toObjs(lowStockResult)) {
        const qty = r.quantity as number
        const reorder = r.reorderPoint as number
        notifications.push({
          id: `stock-${r.id}`,
          type: 'low-stock',
          title: qty === 0 ? 'Out of Stock' : 'Low Stock',
          message: `${r.name}: ${qty} left (min: ${reorder})`,
          productName: r.name as string,
          productId: r.id as string,
          severity: qty === 0 ? 'danger' : 'warning',
          meta: { quantity: qty, reorderPoint: reorder, category: r.category, batchNumber: r.batchNumber },
        })
      }

      return NextResponse.json({ notifications, count: notifications.length })
    }

    // ========================================================================
    // Prisma fallback
    // ========================================================================
    const { db } = await import('@/lib/db')
    const [expiringProducts, lowStockItems] = await Promise.all([
      db.product.findMany({
        where: {
          expiryDate: { not: null },
          inventory: { quantity: { gt: 0 } },
        },
        include: { inventory: true },
      }),
      db.inventory.findMany({
        where: { quantity: { lte: 0 } },
        include: { product: true },
      }),
    ])

    const notifications: Notification[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const limit14 = new Date(today)
    limit14.setDate(limit14.getDate() + 14)

    for (const p of expiringProducts) {
      if (!p.expiryDate) continue
      const expiry = new Date(p.expiryDate)
      expiry.setHours(0, 0, 0, 0)
      if (expiry < today || expiry > limit14) continue
      const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      const qty = p.inventory?.[0]?.quantity ?? 0
      notifications.push({
        id: `exp-${p.id}`,
        type: 'expiry',
        title: daysLeft <= 3 ? 'Urgent: Expiring Soon' : 'Expiring Soon',
        message: `${p.name} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
        productName: p.name,
        productId: p.id,
        severity: daysLeft <= 3 ? 'danger' : 'warning',
        meta: { daysLeft, expiryDate: p.expiryDate, quantity: qty },
      })
    }

    for (const inv of lowStockItems) {
      const reorder = inv.product.reorderPoint ?? 0
      notifications.push({
        id: `stock-${inv.productId}`,
        type: 'low-stock',
        title: inv.quantity === 0 ? 'Out of Stock' : 'Low Stock',
        message: `${inv.product.name}: ${inv.quantity} left (min: ${reorder})`,
        productName: inv.product.name,
        productId: inv.productId,
        severity: inv.quantity === 0 ? 'danger' : 'warning',
        meta: { quantity: inv.quantity, reorderPoint: reorder },
      })
    }

    return NextResponse.json({ notifications, count: notifications.length })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json(
      { notifications: [], count: 0, error: 'Failed to fetch notifications' },
      { status: 500 },
    )
  }
}
