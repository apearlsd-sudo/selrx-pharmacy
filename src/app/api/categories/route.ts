import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'

// GET /api/categories - List all categories
export async function GET() {
  try {
    if (isTurso()) {
      // Raw SQL path - fetch categories with product count via subquery
      // Note: category is a string field on Product, not a foreign key
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
