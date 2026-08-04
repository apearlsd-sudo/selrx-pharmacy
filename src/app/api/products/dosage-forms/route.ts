import { NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// GET /api/products/dosage-forms — Distinct dosage forms from existing products
export async function GET() {
  try {
    if (isTurso()) {
      const result = await turso.execute({
        sql: `SELECT DISTINCT "dosageForm" FROM "Product" WHERE "dosageForm" IS NOT NULL AND "dosageForm" != '' ORDER BY "dosageForm" ASC`,
        args: [],
      })
      const forms: string[] = result.rows.map((r) => r.dosageForm as string)
      return NextResponse.json(forms)
    } else {
      const { db } = await import('@/lib/db')
      const products = await db.product.findMany({
        where: { dosageForm: { not: null } },
        select: { dosageForm: true },
        distinct: ['dosageForm'],
        orderBy: { dosageForm: 'asc' },
      })
      return NextResponse.json(products.map((p) => p.dosageForm!))
    }
  } catch (error) {
    console.error('Error fetching dosage forms:', error)
    return NextResponse.json([], { status: 200 })
  }
}
