import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// PUT /api/categories/[id] - Update a category
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, description } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }

    if (isTurso()) {
      // Raw SQL path
      // Check if category exists
      const existing = await turso.execute({
        sql: `SELECT id FROM "Category" WHERE id = ?`,
        args: [id],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }

      const normalizedName = name.trim().toUpperCase().replace(/\s+/g, '_')
      const now = new Date().toISOString()

      await turso.execute({
        sql: `
          UPDATE "Category"
          SET name = ?, description = ?, "updatedAt" = ?
          WHERE id = ?
        `,
        args: [
          normalizedName,
          description || null,
          now,
          id,
        ],
      })

      // Fetch the updated category
      const result = await turso.execute({
        sql: `SELECT * FROM "Category" WHERE id = ?`,
        args: [id],
      })

      const row = result.rows[0]
      const category = {
        id: row.id as string,
        name: row.name as string,
        description: row.description as string | null,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
      }

      return NextResponse.json(category)
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const category = await db.category.update({
        where: { id },
        data: {
          name: name.trim().toUpperCase().replace(/\s+/g, '_'),
          description: description || null,
        },
      })

      return NextResponse.json(category)
    }
  } catch (error: any) {
    console.error('Error updating category:', error)
    if (!isTurso()) {
      if (error.code === 'P2025') {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
    }
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

// DELETE /api/categories/[id] - Delete a category
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (isTurso()) {
      // Raw SQL path
      // First, get the category name since Product.category is a string field (not FK)
      const catResult = await turso.execute({
        sql: `SELECT name FROM "Category" WHERE id = ?`,
        args: [id],
      })
      if (catResult.rows.length === 0) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }

      const categoryName = catResult.rows[0].name as string

      // Check if any products use this category name
      const countResult = await turso.execute({
        sql: `SELECT COUNT(*) as total FROM "Product" WHERE category = ?`,
        args: [categoryName],
      })
      const productsCount = Number(countResult.rows[0].total)

      if (productsCount > 0) {
        return NextResponse.json(
          { error: `Cannot delete category — ${productsCount} product(s) are assigned to it. Reassign them first.` },
          { status: 409 }
        )
      }

      await turso.execute({
        sql: `DELETE FROM "Category" WHERE id = ?`,
        args: [id],
      })

      return NextResponse.json({ success: true })
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      // Check if any products use this category
      const productsCount = await db.product.count({
        where: { category: id },
      })
      if (productsCount > 0) {
        return NextResponse.json(
          { error: `Cannot delete category — ${productsCount} product(s) are assigned to it. Reassign them first.` },
          { status: 409 }
        )
      }

      await db.category.delete({
        where: { id },
      })

      return NextResponse.json({ success: true })
    }
  } catch (error) {
    console.error('Error deleting category:', error)
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    )
  }
}
