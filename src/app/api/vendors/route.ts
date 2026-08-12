import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// GET /api/vendors - List all vendors
export async function GET() {
  try {
    if (isTurso()) {
      // Raw SQL path - fetch vendors with product count via subquery
      const result = await turso.execute({
        sql: `
          SELECT
            v.id, v.name, v."contactPerson", v.email, v.phone, v.address,
            v.notes, v."createdAt", v."updatedAt",
            (SELECT COUNT(*) FROM "Product" pr WHERE pr."vendorId" = v.id) as product_count
          FROM "Vendor" v
          ORDER BY v.name ASC
        `,
        args: [],
      })

      const vendors = result.rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        contactPerson: row.contactPerson as string | null,
        email: row.email as string | null,
        phone: row.phone as string | null,
        address: row.address as string | null,
        notes: row.notes as string | null,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        _count: {
          products: Number(row.product_count),
        },
      }))

      return NextResponse.json(vendors)
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const vendors = await db.vendor.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { products: true },
          },
        },
      })
      return NextResponse.json(vendors)
    }
  } catch (error) {
    console.error('Error fetching vendors:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vendors' },
      { status: 500 }
    )
  }
}

// POST /api/vendors - Create a new vendor
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, contactPerson, email, phone, address, notes } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Vendor name is required' },
        { status: 400 }
      )
    }

    if (isTurso()) {
      // Raw SQL path
      // Check for duplicate name
      const existing = await turso.execute({
        sql: `SELECT id FROM "Vendor" WHERE name = ? LIMIT 1`,
        args: [name.trim()],
      })
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: 'A vendor with this name already exists' },
          { status: 409 }
        )
      }

      const id = generateId()
      const now = new Date().toISOString()

      await turso.execute({
        sql: `
          INSERT INTO "Vendor" (id, name, "contactPerson", email, phone, address, notes, "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          id,
          name.trim(),
          contactPerson || null,
          email || null,
          phone || null,
          address || null,
          notes || null,
          now,
          now,
        ],
      })

      const vendor = {
        id,
        name: name.trim(),
        contactPerson: contactPerson || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      }

      const { userId, ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId, action: 'VENDOR_CREATED', category: 'catalog', entity: 'Vendor', entityId: id, details: { name: name.trim() }, ipAddress, userAgent }).catch(() => {})
      return NextResponse.json(vendor, { status: 201 })
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const existing = await db.vendor.findFirst({
        where: { name: name.trim() },
      })
      if (existing) {
        return NextResponse.json(
          { error: 'A vendor with this name already exists' },
          { status: 409 }
        )
      }

      const vendor = await db.vendor.create({
        data: {
          name: name.trim(),
          contactPerson: contactPerson || null,
          email: email || null,
          phone: phone || null,
          address: address || null,
          notes: notes || null,
        },
      })

      const { userId, ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId, action: 'VENDOR_CREATED', category: 'catalog', entity: 'Vendor', entityId: vendor.id, details: { name: name.trim() }, ipAddress, userAgent }).catch(() => {})
      return NextResponse.json(vendor, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating vendor:', error)
    return NextResponse.json(
      { error: 'Failed to create vendor' },
      { status: 500 }
    )
  }
}
