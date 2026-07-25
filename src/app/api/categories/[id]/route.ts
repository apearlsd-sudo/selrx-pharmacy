import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// DELETE /api/categories/[id] - Delete a category
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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
  } catch (error) {
    console.error('Error deleting category:', error)
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    )
  }
}
