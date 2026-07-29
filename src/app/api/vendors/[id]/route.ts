import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// PUT /api/vendors/[id] - Update a vendor
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, contactPerson, email, phone, address, notes } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 })
    }

    if (isTurso()) {
      // Raw SQL path
      // Check if vendor exists
      const existing = await turso.execute({
        sql: `SELECT id FROM "Vendor" WHERE id = ?`,
        args: [id],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
      }

      const now = new Date().toISOString()

      await turso.execute({
        sql: `
          UPDATE "Vendor"
          SET name = ?, "contactPerson" = ?, email = ?, phone = ?, address = ?, notes = ?, "updatedAt" = ?
          WHERE id = ?
        `,
        args: [
          name.trim(),
          contactPerson || null,
          email || null,
          phone || null,
          address || null,
          notes || null,
          now,
          id,
        ],
      })

      // Fetch the updated vendor
      const result = await turso.execute({
        sql: `SELECT * FROM "Vendor" WHERE id = ?`,
        args: [id],
      })

      const row = result.rows[0]
      const vendor = {
        id: row.id as string,
        name: row.name as string,
        contactPerson: row.contactPerson as string | null,
        email: row.email as string | null,
        phone: row.phone as string | null,
        address: row.address as string | null,
        notes: row.notes as string | null,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
      }

      return NextResponse.json(vendor)
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const vendor = await db.vendor.update({
        where: { id },
        data: {
          name: name.trim(),
          contactPerson: contactPerson || null,
          email: email || null,
          phone: phone || null,
          address: address || null,
          notes: notes || null,
        },
      })

      return NextResponse.json(vendor)
    }
  } catch (error: any) {
    console.error('Error updating vendor:', error)
    if (!isTurso()) {
      if (error.code === 'P2025') {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
      }
    }
    return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 })
  }
}

// DELETE /api/vendors/[id] - Delete a vendor
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (isTurso()) {
      // Raw SQL path
      // Check how many products are linked to this vendor
      const countResult = await turso.execute({
        sql: `SELECT COUNT(*) as total FROM "Product" WHERE "vendorId" = ?`,
        args: [id],
      })
      const productsCount = Number(countResult.rows[0].total)

      if (productsCount > 0) {
        return NextResponse.json(
          { error: `Cannot delete vendor — ${productsCount} product(s) are linked. Unlink them first.` },
          { status: 409 }
        )
      }

      await turso.execute({
        sql: `DELETE FROM "Vendor" WHERE id = ?`,
        args: [id],
      })

      return NextResponse.json({ success: true })
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

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
    }
  } catch (error) {
    console.error('Error deleting vendor:', error)
    return NextResponse.json(
      { error: 'Failed to delete vendor' },
      { status: 500 }
    )
  }
}
