import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * DELETE /api/manufacturers/[id]
 *   Deletes a manufacturer. Since Product.manufacturer is plain text
 *   (not an FK), deleting a manufacturer does NOT break existing product
 *   records — they just keep their stored manufacturer name as a free-text
 *   value. We don't block deletion based on product count, but we do
 *   return a warning in the response so the UI can inform the user.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.manufacturer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Manufacturer not found' },
        { status: 404 }
      )
    }

    // Count how many products currently reference this manufacturer by
    // name. We don't block the deletion (since there's no FK), but we
    // return the count so the UI can warn the user that those products
    // will keep their stored text but lose the link in the dropdown.
    const productCount = await db.product.count({
      where: { manufacturer: existing.name },
    })

    await db.manufacturer.delete({ where: { id } })

    return NextResponse.json({
      success: true,
      affectedProducts: productCount,
      warning:
        productCount > 0
          ? `${productCount} product(s) still have "${existing.name}" stored as their manufacturer (plain text). They were not modified.`
          : null,
    })
  } catch (error) {
    console.error('Error deleting manufacturer:', error)
    return NextResponse.json(
      { error: 'Failed to delete manufacturer' },
      { status: 500 }
    )
  }
}
