/**
 * CONTROLLED SUBSTANCE INVENTORY
 *
 * GET /api/controlled-substances/inventory — Current stock levels of all controlled substances
 */

import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, sqlRaw } from '@/lib/turso'
import { runAutoExpiry } from '@/lib/auto-expiry'

export async function GET() {
  try {
    if (isTurso()) {
      // Auto-expire before querying stock levels
      await runAutoExpiry()

      const result = await turso.execute(sqlRaw(`SELECT p.id, p.name, p.ndc, p."dosageForm", p.strength, p."deaSchedule",
                     p."sellingPrice", p."requiresPrescription",
                     i.quantity as stock,
                     COALESCE(total_dispensed.total_qty, 0) as totalDispensed
              FROM "Product" p
              LEFT JOIN "Inventory" i ON i."productId" = p.id
              LEFT JOIN (
                SELECT "productId", SUM(quantity) as total_qty
                FROM "ControlledSubstanceLog"
                GROUP BY "productId"
              ) total_dispensed ON total_dispensed."productId" = p.id
              WHERE p."controlledSubstance" = 1
              ORDER BY p.name`, []))

      const items = result.rows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        ndc: (r.ndc as string) || null,
        dosageForm: (r.dosageForm as string) || null,
        strength: (r.strength as string) || null,
        deaSchedule: (r.deaSchedule as string) || null,
        sellingPrice: Number(r.sellingPrice) || 0,
        requiresPrescription: !!(r.requiresPrescription as number),
        stock: Number(r.stock) || 0,
        totalDispensed: Number(r.totalDispensed) || 0,
      }))

      return NextResponse.json({ items, total: items.length })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const products = await db.product.findMany({
      where: { controlledSubstance: true },
      include: { inventory: true },
      orderBy: { name: 'asc' },
    })

    const items = products.map((p: any) => ({
      id: p.id,
      name: p.name,
      ndc: p.ndc || null,
      dosageForm: p.dosageForm || null,
      strength: p.strength || null,
      deaSchedule: p.deaSchedule || null,
      sellingPrice: p.sellingPrice || 0,
      requiresPrescription: p.requiresPrescription || false,
      stock: p.inventory?.quantity || 0,
      totalDispensed: 0,
    }))

    return NextResponse.json({ items, total: items.length })
  } catch (error) {
    console.error('[controlled-substances/inventory] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch controlled substance inventory' }, { status: 500 })
  }
}
