import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// DELETE /api/vendors/[id] - Delete a vendor
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const productsCount = await db.product.count({
      where: { vendorId: id },
    })
    if (productsCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete vendor — ${productsCount} product(s) are linked. Unlink them first.` },
        { status: 409 }
      )
    }

    await db.vendor.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting vendor:', error)
    return NextResponse.json(
      { error: 'Failed to delete vendor' },
      { status: 500 }
    )
  }
}
