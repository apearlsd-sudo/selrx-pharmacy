import { NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// GET /api/notifications/low-stock-po
// Returns products at or below their reorder point, grouped by vendor,
// suitable for auto-filling a purchase order.

interface LowStockItem {
  id: string
  name: string
  ndc: string | null
  costPrice: number | null
  reorderPoint: number
  reorderQty: number
  vendorId: string | null
  vendorName: string | null
  sellingUnit: string
  currentStock: number
}

export async function GET() {
  try {
    if (isTurso()) {
      const result = await turso.execute({
        sql: `SELECT p.id, p.name, p.ndc, p."costPrice", p."reorderPoint", p."reorderQty",
                       p."vendorId", p."sellingUnit", i.quantity as currentStock,
                       v.name as vendorName, v.id as vendorId
                FROM "Product" p
                LEFT JOIN "Inventory" i ON i."productId" = p.id
                LEFT JOIN "Vendor" v ON v.id = p."vendorId"
                WHERE p.status = 'ACTIVE'
                  AND i.quantity <= p."reorderPoint"
                ORDER BY v.name, p.name`,
        args: [],
      })

      const items: LowStockItem[] = result.rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        ndc: (row.ndc as string) || null,
        costPrice: row.costPrice != null ? Number(row.costPrice) : null,
        reorderPoint: Number(row.reorderPoint) || 0,
        reorderQty: Number(row.reorderQty) || 0,
        vendorId: (row.vendorId as string) || null,
        vendorName: (row.vendorName as string) || null,
        sellingUnit: (row.sellingUnit as string) || 'EA',
        currentStock: Number(row.currentStock) || 0,
      }))

      // Group by vendor name
      const groupedByVendor: Record<string, LowStockItem[]> = {}
      for (const item of items) {
        const vendor = item.vendorName || 'No Vendor'
        if (!groupedByVendor[vendor]) {
          groupedByVendor[vendor] = []
        }
        groupedByVendor[vendor].push(item)
      }

      return NextResponse.json({ items, groupedByVendor })
    } else {
      // --- Prisma fallback (local dev) ---
      const { db } = await import('@/lib/db')

      const lowStockProducts = await db.product.findMany({
        where: {
          status: 'ACTIVE',
          inventory: {
            quantity: { lte: 0 }, // Prisma fallback: will filter below
          },
        },
        include: {
          inventory: true,
          vendor: {
            select: { id: true, name: true },
          },
        },
        orderBy: [{ name: 'asc' }],
      })

      // Filter properly: currentStock <= reorderPoint
      const items: LowStockItem[] = lowStockProducts
        .filter((p) => {
          const inv = p.inventory?.[0]
          if (!inv) return false
          return inv.quantity <= (p.reorderPoint ?? 0)
        })
        .map((p) => ({
          id: p.id,
          name: p.name,
          ndc: p.ndc || null,
          costPrice: p.costPrice ?? null,
          reorderPoint: p.reorderPoint ?? 0,
          reorderQty: p.reorderQty ?? 0,
          vendorId: p.vendor?.id || null,
          vendorName: p.vendor?.name || null,
          sellingUnit: p.sellingUnit || 'EA',
          currentStock: p.inventory?.[0]?.quantity ?? 0,
        }))

      // Sort by vendor name then product name (PostgreSQL returns sorted by name already)
      items.sort((a, b) => {
        const vComp = (a.vendorName || 'No Vendor').localeCompare(b.vendorName || 'No Vendor')
        if (vComp !== 0) return vComp
        return a.name.localeCompare(b.name)
      })

      const groupedByVendor: Record<string, LowStockItem[]> = {}
      for (const item of items) {
        const vendor = item.vendorName || 'No Vendor'
        if (!groupedByVendor[vendor]) {
          groupedByVendor[vendor] = []
        }
        groupedByVendor[vendor].push(item)
      }

      return NextResponse.json({ items, groupedByVendor })
    }
  } catch (error) {
    console.error('Error fetching low-stock PO suggestions:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to fetch low-stock PO suggestions', detail: msg },
      { status: 500 },
    )
  }
}
