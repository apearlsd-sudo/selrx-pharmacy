import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/manufacturers - List all manufacturers
export async function GET() {
  try {
    const manufacturers = await db.manufacturer.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    })
    return NextResponse.json(manufacturers)
  } catch (error) {
    console.error('Error fetching manufacturers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch manufacturers' },
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

    return NextResponse.json(manufacturer, { status: 201 })
  } catch (error) {
    console.error('Error creating manufacturer:', error)
    return NextResponse.json(
      { error: 'Failed to create manufacturer' },
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

    return NextResponse.json(manufacturer)
  } catch (error: any) {
    console.error('Error updating manufacturer:', error)
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })
    }
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'A manufacturer with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to update manufacturer' }, { status: 500 })
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

    await db.manufacturer.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting manufacturer:', error)
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to delete manufacturer' }, { status: 500 })
  }
}
