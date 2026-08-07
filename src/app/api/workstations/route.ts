import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// GET /api/workstations — list all workstations
export async function GET() {
  try {
    if (isTurso()) {
      const result = await turso.execute({
        sql: `SELECT id, name, description, location, "isActive", "createdAt", "updatedAt"
              FROM "Workstation" ORDER BY "createdAt" ASC`,
        args: [],
      })
      const workstations = result.rows.map((r) => ({
        id: r[0] as string,
        name: r[1] as string,
        description: (r[2] as string) || null,
        location: (r[3] as string) || null,
        isActive: Boolean(r[4]),
        createdAt: r[5] as string,
        updatedAt: r[6] as string,
      }))
      return NextResponse.json({ workstations })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const workstations = await db.workstation.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, description: true, location: true, isActive: true, createdAt: true, updatedAt: true },
    })
    return NextResponse.json({ workstations })
  } catch (error) {
    console.error('GET /api/workstations error:', error)
    return NextResponse.json({ error: 'Failed to fetch workstations' }, { status: 500 })
  }
}

// POST /api/workstations — create workstation
export async function POST(req: NextRequest) {
  try {
    const { name, description, location } = await req.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()

    if (isTurso()) {
      await turso.execute({
        sql: `INSERT INTO "Workstation" (id, name, description, location, "isActive", "createdAt", "updatedAt")
              VALUES (?, ?, ?, ?, 1, ?, ?)`,
        args: [id, name.trim(), description?.trim() || null, location?.trim() || null, now, now],
      })
      return NextResponse.json({ id, name: name.trim(), description, location, isActive: true, createdAt: now, updatedAt: now })
    }

    const { db } = await import('@/lib/db')
    const ws = await db.workstation.create({
      data: { name: name.trim(), description: description?.trim() || null, location: location?.trim() || null },
    })
    return NextResponse.json(ws)
  } catch (error) {
    console.error('POST /api/workstations error:', error)
    return NextResponse.json({ error: 'Failed to create workstation' }, { status: 500 })
  }
}

// PUT /api/workstations — update workstation
export async function PUT(req: NextRequest) {
  try {
    const { id, name, description, location, isActive } = await req.json()
    if (!id || !name?.trim()) {
      return NextResponse.json({ error: 'ID and name are required' }, { status: 400 })
    }
    const now = new Date().toISOString()

    if (isTurso()) {
      await turso.execute({
        sql: `UPDATE "Workstation" SET name = ?, description = ?, location = ?, "isActive" = ?, "updatedAt" = ? WHERE id = ?`,
        args: [name.trim(), description?.trim() || null, location?.trim() || null, isActive !== false ? 1 : 0, now, id],
      })
      return NextResponse.json({ id, name: name.trim(), description, location, isActive: isActive !== false, updatedAt: now })
    }

    const { db } = await import('@/lib/db')
    const ws = await db.workstation.update({
      where: { id },
      data: { name: name.trim(), description: description?.trim() || null, location: location?.trim() || null, isActive: isActive !== false },
    })
    return NextResponse.json(ws)
  } catch (error) {
    console.error('PUT /api/workstations error:', error)
    return NextResponse.json({ error: 'Failed to update workstation' }, { status: 500 })
  }
}

// DELETE /api/workstations — soft-delete (set inactive)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }
    const now = new Date().toISOString()

    if (isTurso()) {
      await turso.execute({
        sql: `UPDATE "Workstation" SET "isActive" = 0, "updatedAt" = ? WHERE id = ?`,
        args: [now, id],
      })
      return NextResponse.json({ success: true })
    }

    const { db } = await import('@/lib/db')
    await db.workstation.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/workstations error:', error)
    return NextResponse.json({ error: 'Failed to delete workstation' }, { status: 500 })
  }
}
