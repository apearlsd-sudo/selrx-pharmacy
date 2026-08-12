import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// GET /api/manufacturers - List all manufacturers
export async function GET() {
  try {
    if (isTurso()) {
      // Raw SQL path - fetch manufacturers with product count via subquery
      const result = await turso.execute({
        sql: `
          SELECT
            m.id, m.name, m."contactPerson", m.email, m.phone, m.address,
            m.city, m.country, m.website, m.notes, m."createdAt", m."updatedAt",
            (SELECT COUNT(*) FROM "Product" pr WHERE pr."manufacturerId" = m.id) as product_count
          FROM "Manufacturer" m
          ORDER BY m.name ASC
        `,
        args: [],
      })

      const manufacturers = result.rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        contactPerson: row.contactPerson as string | null,
        email: row.email as string | null,
        phone: row.phone as string | null,
        address: row.address as string | null,
        city: row.city as string | null,
        country: row.country as string | null,
        website: row.website as string | null,
        notes: row.notes as string | null,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        _count: {
          products: Number(row.product_count),
        },
      }))

      return NextResponse.json(manufacturers)
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const manufacturers = await db.manufacturer.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { products: true },
          },
        },
      })
      return NextResponse.json(manufacturers)
    }
  } catch (error: any) {
    console.error('Error fetching manufacturers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch manufacturers', detail: error.message, code: error.code },
      { status: 500 }
    )
  }
}

// POST /api/manufacturers - Create a new manufacturer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, contactPerson, email, phone, address, city, country, website, notes } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Manufacturer name is required' },
        { status: 400 }
      )
    }

    if (isTurso()) {
      // Raw SQL path
      // Check for duplicate name
      const existing = await turso.execute({
        sql: `SELECT id FROM "Manufacturer" WHERE name = ? LIMIT 1`,
        args: [name.trim()],
      })
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: 'A manufacturer with this name already exists' },
          { status: 409 }
        )
      }

      const id = generateId()
      const now = new Date().toISOString()

      await turso.execute({
        sql: `
          INSERT INTO "Manufacturer" (id, name, "contactPerson", email, phone, address, city, country, website, notes, "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          id,
          name.trim(),
          contactPerson || null,
          email || null,
          phone || null,
          address || null,
          city || null,
          country || null,
          website || null,
          notes || null,
          now,
          now,
        ],
      })

      const manufacturer = {
        id,
        name: name.trim(),
        contactPerson: contactPerson || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        country: country || null,
        website: website || null,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      }

      const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({ userId: auditUserId, action: 'MANUFACTURER_CREATED', category: 'catalog', entity: 'Manufacturer', entityId: id, details: { name: name.trim() }, ipAddress, userAgent })

      return NextResponse.json(manufacturer, { status: 201 })
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const existing = await db.manufacturer.findFirst({
        where: { name: name.trim() },
      })
      if (existing) {
        return NextResponse.json(
          { error: 'A manufacturer with this name already exists' },
          { status: 409 }
        )
      }

      const manufacturer = await db.manufacturer.create({
        data: {
          name: name.trim(),
          contactPerson: contactPerson || null,
          email: email || null,
          phone: phone || null,
          address: address || null,
          city: city || null,
          country: country || null,
          website: website || null,
          notes: notes || null,
        },
      })

      const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({ userId: auditUserId, action: 'MANUFACTURER_CREATED', category: 'catalog', entity: 'Manufacturer', entityId: manufacturer.id, details: { name: name.trim() }, ipAddress, userAgent })

      return NextResponse.json(manufacturer, { status: 201 })
    }
  } catch (error: any) {
    console.error('Error creating manufacturer:', error)
    return NextResponse.json(
      { error: 'Failed to create manufacturer', detail: error.message, code: error.code },
      { status: 500 }
    )
  }
}

// PUT /api/manufacturers - Update a manufacturer
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, contactPerson, email, phone, address, city, country, website, notes } = body

    if (!id) {
      return NextResponse.json({ error: 'Manufacturer ID is required' }, { status: 400 })
    }

    if (isTurso()) {
      // Raw SQL path
      // Check if manufacturer exists
      const existing = await turso.execute({
        sql: `SELECT id FROM "Manufacturer" WHERE id = ?`,
        args: [id],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })
      }

      // Build dynamic UPDATE
      const updateFields: string[] = []
      const updateArgs: (string | number | null)[] = []

      if (name !== undefined) {
        updateFields.push(`name = ?`)
        updateArgs.push(name.trim())
      }
      if (contactPerson !== undefined) {
        updateFields.push(`"contactPerson" = ?`)
        updateArgs.push(contactPerson || null)
      }
      if (email !== undefined) {
        updateFields.push(`email = ?`)
        updateArgs.push(email || null)
      }
      if (phone !== undefined) {
        updateFields.push(`phone = ?`)
        updateArgs.push(phone || null)
      }
      if (address !== undefined) {
        updateFields.push(`address = ?`)
        updateArgs.push(address || null)
      }
      if (city !== undefined) {
        updateFields.push(`city = ?`)
        updateArgs.push(city || null)
      }
      if (country !== undefined) {
        updateFields.push(`country = ?`)
        updateArgs.push(country || null)
      }
      if (website !== undefined) {
        updateFields.push(`website = ?`)
        updateArgs.push(website || null)
      }
      if (notes !== undefined) {
        updateFields.push(`notes = ?`)
        updateArgs.push(notes || null)
      }

      if (updateFields.length > 0) {
        updateFields.push(`"updatedAt" = ?`)
        updateArgs.push(new Date().toISOString())

        const sql = `UPDATE "Manufacturer" SET ${updateFields.join(', ')} WHERE id = ?`
        updateArgs.push(id)

        try {
          await turso.execute({ sql, args: updateArgs })
        } catch (updateError: any) {
          // Handle UNIQUE constraint violation (equivalent to Prisma P2002)
          const errorMsg = String(updateError.message || '')
          if (
            errorMsg.includes('UNIQUE constraint') ||
            errorMsg.includes('SQLITE_CONSTRAINT_UNIQUE')
          ) {
            return NextResponse.json({ error: 'A manufacturer with this name already exists' }, { status: 409 })
          }
          throw updateError
        }
      }

      // Fetch the updated manufacturer
      const result = await turso.execute({
        sql: `SELECT * FROM "Manufacturer" WHERE id = ?`,
        args: [id],
      })

      const row = result.rows[0]
      const manufacturer = {
        id: row.id as string,
        name: row.name as string,
        contactPerson: row.contactPerson as string | null,
        email: row.email as string | null,
        phone: row.phone as string | null,
        address: row.address as string | null,
        city: row.city as string | null,
        country: row.country as string | null,
        website: row.website as string | null,
        notes: row.notes as string | null,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
      }

      const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({ userId: auditUserId, action: 'MANUFACTURER_UPDATED', category: 'catalog', entity: 'Manufacturer', entityId: id, details: { name: name?.trim() }, ipAddress, userAgent })

      return NextResponse.json(manufacturer)
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const manufacturer = await db.manufacturer.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(contactPerson !== undefined && { contactPerson: contactPerson || null }),
          ...(email !== undefined && { email: email || null }),
          ...(phone !== undefined && { phone: phone || null }),
          ...(address !== undefined && { address: address || null }),
          ...(city !== undefined && { city: city || null }),
          ...(country !== undefined && { country: country || null }),
          ...(website !== undefined && { website: website || null }),
          ...(notes !== undefined && { notes: notes || null }),
        },
      })

      const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({ userId: auditUserId, action: 'MANUFACTURER_UPDATED', category: 'catalog', entity: 'Manufacturer', entityId: id, details: { name: name?.trim() }, ipAddress, userAgent })

      return NextResponse.json(manufacturer)
    }
  } catch (error: any) {
    console.error('Error updating manufacturer:', error)
    if (!isTurso()) {
      // Prisma-specific error codes only apply in fallback path
      if (error.code === 'P2025') {
        return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })
      }
      if (error.code === 'P2002') {
        return NextResponse.json({ error: 'A manufacturer with this name already exists' }, { status: 409 })
      }
    }
    return NextResponse.json({ error: 'Failed to update manufacturer', detail: error.message, code: error.code }, { status: 500 })
  }
}

// DELETE /api/manufacturers - Delete a manufacturer
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Manufacturer ID is required' }, { status: 400 })
    }

    if (isTurso()) {
      // Raw SQL path
      // Check if manufacturer exists
      const existing = await turso.execute({
        sql: `SELECT id FROM "Manufacturer" WHERE id = ?`,
        args: [id],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })
      }

      await turso.execute({
        sql: `DELETE FROM "Manufacturer" WHERE id = ?`,
        args: [id],
      })
      const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({ userId: auditUserId, action: 'MANUFACTURER_DELETED', category: 'catalog', entity: 'Manufacturer', entityId: id, ipAddress, userAgent })
      return NextResponse.json({ success: true })
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      await db.manufacturer.delete({ where: { id } })
      const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({ userId: auditUserId, action: 'MANUFACTURER_DELETED', category: 'catalog', entity: 'Manufacturer', entityId: id, ipAddress, userAgent })
      return NextResponse.json({ success: true })
    }
  } catch (error: any) {
    console.error('Error deleting manufacturer:', error)
    if (!isTurso()) {
      if (error.code === 'P2025') {
        return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })
      }
    }
    return NextResponse.json({ error: 'Failed to delete manufacturer', detail: error.message, code: error.code }, { status: 500 })
  }
}
