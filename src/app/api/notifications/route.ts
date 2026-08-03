import { NextResponse } from 'next/server'
import { turso, isTurso, safeArgs } from '@/lib/turso'
import { getDaysToExpiry, getTimezoneOffsetHours, getTodayWAT } from '@/lib/date-utils'

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
      // Compute dynamic UTC offset from the configured timezone
      const offsetH = getTimezoneOffsetHours()
      const tzModifier = offsetH >= 0 ? `+${offsetH} hour` : `${offsetH} hour`
      const [expiringResult, lowStockResult] = await Promise.all([
        // Individual batches expiring within 14 days (batch-aware notifications)
        turso.execute({
          sql: `SELECT b.id as batchId, b."productId", b."batchNumber", b."expiryDate",
                       b.quantity as batchQty, p.name, p.sellingPrice, p.category
                FROM "Batch" b
                JOIN "Product" p ON p.id = b."productId"
                WHERE b."expiryDate" IS NOT NULL
                  AND b."expiryDate" != ''
                  AND b.quantity > 0
                  AND date(b."expiryDate") >= date('now', '${tzModifier}')
                  AND date(b."expiryDate") <= date('now', '${tzModifier}', '+14 days')
                ORDER BY date(b."expiryDate") ASC`,
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

      // Process expiry notifications using WAT-aware calculation (per-batch)
      for (const r of toObjs(expiringResult)) {
        const expDate = r.expiryDate as string
        const daysLeft = getDaysToExpiry(expDate) ?? 0
        const batchLabel = (r.batchNumber as string) ? ` (${r.batchNumber})` : ''

        notifications.push({
          id: `exp-${r.batchId}`,
          type: 'expiry',
          title: daysLeft <= 3 ? 'Urgent: Expiring Soon' : 'Expiring Soon',
          message: `${r.name}${batchLabel}: ${r.batchQty} units expire in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
          productName: r.name as string,
          productId: r.productId as string,
          severity: daysLeft <= 3 ? 'danger' : 'warning',
          meta: { daysLeft, expiryDate: expDate, batchQty: r.batchQty, batchNumber: r.batchNumber, category: r.category },
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
    const todayWAT = getTodayWAT()
    const todayDate = new Date(todayWAT + 'T12:00:00')
    const limit14Date = new Date(todayDate)
    limit14Date.setDate(limit14Date.getDate() + 14)
    const limit14Str = limit14Date.toISOString().split('T')[0]

    for (const p of expiringProducts) {
      if (!p.expiryDate) continue
      const expStr = p.expiryDate.split('T')[0]
      if (expStr < todayWAT || expStr > limit14Str) continue
      const daysLeft = getDaysToExpiry(p.expiryDate) ?? 0
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
