import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

/**
 * GET /api/product-history/all
 * Returns all product activity log across all products (for Reports page).
 * Supports: ?action=CREATED|UPDATED|DELETED, ?search=product name, ?page, ?limit
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || ''
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (isTurso()) {
      const offset = (page - 1) * limit
      const whereClauses: string[] = []
      const args: any[] = []

      if (action) {
        whereClauses.push('ph.action = ?')
        args.push(action)
      }
      if (search) {
        whereClauses.push('p."name" LIKE ?')
        args.push(`%${search}%`)
      }

      const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

      const [countResult, rowsResult] = await Promise.all([
        turso.execute({
          sql: `SELECT COUNT(*) as cnt
                FROM "ProductHistory" ph
                LEFT JOIN "Product" p ON ph."productId" = p.id
                ${whereSQL}`,
          args,
        }),
        turso.execute({
          sql: `SELECT ph.id, ph."productId", ph.action, ph."changedFields",
                       ph."previousValues", ph."newValues", ph."userId",
                       u.name as "userName",
                       p."name" as "productName", p.ndc as "productNdc",
                       ph."createdAt"
                FROM "ProductHistory" ph
                LEFT JOIN "Product" p ON ph."productId" = p.id
                LEFT JOIN User u ON ph."userId" = u.id
                ${whereSQL}
                ORDER BY ph."createdAt" DESC
                LIMIT ? OFFSET ?`,
          args: [...args, limit, offset],
        }),
      ])

      const total = Number(countResult.rows[0]?.cnt || 0)
      const history = rowsResult.rows.map((row: any) => ({
        id: row.id,
        productId: row.productId,
        action: row.action,
        changedFields: row.changedFields,
        previousValues: row.previousValues,
        newValues: row.newValues,
        userId: row.userId,
        userName: row.userName || 'Unknown',
        productName: row.productName || 'Unknown',
        productNdc: row.productNdc || null,
        createdAt: row.createdAt,
      }))

      return NextResponse.json({
        history,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      })
    }

    // Prisma fallback — use raw query via Turso if available, otherwise skip
    // (ProductHistory is primarily a Turso feature)
    return NextResponse.json({ history: [], pagination: { page, limit, total: 0, pages: 0 } })
  } catch (error) {
    console.error('Error fetching all product history:', error)
    return NextResponse.json({ error: 'Failed to fetch product history' }, { status: 500 })
  }
}
