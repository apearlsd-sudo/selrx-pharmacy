import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'

// GET /api/categories - List all categories
export async function GET() {
  try {
    if (isTurso()) {
      // Raw SQL path - fetch categories from Category table
      const result = await turso.execute({
        sql: `
          SELECT
            c.id, c.name, c.description, c."createdAt", c."updatedAt",
            (SELECT COUNT(*) FROM "Product" pr WHERE pr.category = c.name) as product_count
          FROM "Category" c
          ORDER BY c.name ASC
        `,
        args: [],
      })

      const categories = result.rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        description: row.description as string | null,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        _count: {
          products: Number(row.product_count),
        },
      }))

      // Also fetch distinct category values from Product table
      // that may not exist in the Category table, with product counts
      const productCatsResult = await turso.execute({
        sql: `SELECT category, COUNT(*) as cnt FROM "Product" WHERE category IS NOT NULL AND category != '' GROUP BY category ORDER BY category ASC`,
        args: [],
      })
      const tableCategoryNames = new Set(categories.map((c) => c.name))

      // Add product-only categories (not already in Category table)
      for (const row of productCatsResult.rows) {
        const catName = row.category as string
        if (!tableCategoryNames.has(catName)) {
          categories.push({
            id: `__product_cat__${catName}`,
            name: catName,
            description: null,
            createdAt: '',
            updatedAt: '',
            _count: { products: Number(row.cnt) },
          })
        }
      }

      // Re-sort after merging
      categories.sort((a, b) => a.name.localeCompare(b.name))

      return NextResponse.json(categories)
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const categories = await db.category.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { products: true },
          },
        },
      })

      // Also fetch distinct category values from Product table with counts
      const productCats = await db.product.groupBy({
        by: ['category'],
        where: { category: { notIn: [''] } },
        _count: { id: true },
        orderBy: { category: 'asc' },
      })
      const tableCatNames = new Set(categories.map((c) => c.name))
      for (const pc of productCats) {
        if (pc.category && pc.category !== '' && !tableCatNames.has(pc.category)) {
          categories.push({
            id: `__product_cat__${pc.category}`,
            name: pc.category,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: { products: pc._count.id ?? 0 },
          })
        }
      }
      categories.sort((a, b) => a.name.localeCompare(b.name))

      return NextResponse.json(categories)
    }
  } catch (error) {
    console.error('Error fetching categories:', error)
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    )
  }
}

// POST /api/categories - Create a new category
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      )
    }

    const trimmedName = name.trim().toUpperCase().replace(/\s+/g, '_')

    if (isTurso()) {
      // Raw SQL path
      // Check for duplicate - match both the uppercase version and the trimmed input
      const existing = await turso.execute({
        sql: `SELECT id FROM "Category" WHERE name = ? OR name = ? LIMIT 1`,
        args: [trimmedName, name.trim()],
      })
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: 'A category with this name already exists' },
          { status: 409 }
        )
      }

      const id = generateId()
      const now = new Date().toISOString()

      await turso.execute({
        sql: `
          INSERT INTO "Category" (id, name, description, "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?)
        `,
        args: [
          id,
          trimmedName,
          description || null,
          now,
          now,
        ],
      })

      const category = {
        id,
        name: trimmedName,
        description: description || null,
        createdAt: now,
        updatedAt: now,
      }

      return NextResponse.json(category, { status: 201 })
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      // Check for duplicate
      const existing = await db.category.findFirst({
        where: {
          OR: [
            { name: trimmedName },
            { name: name.trim() },
          ],
        },
      })
      if (existing) {
        return NextResponse.json(
          { error: 'A category with this name already exists' },
          { status: 409 }
        )
      }

      const category = await db.category.create({
        data: {
          name: trimmedName,
          description: description || null,
        },
      })

      return NextResponse.json(category, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating category:', error)
    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
    )
  }
}
