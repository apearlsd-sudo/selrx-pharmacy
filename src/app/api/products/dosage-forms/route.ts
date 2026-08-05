import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// GET /api/products/dosage-forms — All active dosage forms from the DosageForm table
export async function GET() {
  try {
    if (isTurso()) {
      const result = await turso.execute({
        sql: `SELECT name FROM "DosageForm" WHERE "isActive" = 1 ORDER BY name ASC`,
        args: [],
      })
      const forms: string[] = result.rows.map((r) => r.name as string)
      return NextResponse.json(forms)
    } else {
      const { db } = await import('@/lib/db')
      const rows = await db.dosageForm.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { name: true },
      })
      return NextResponse.json(rows.map((r) => r.name))
    }
  } catch (error) {
    console.error('Error fetching dosage forms:', error)
    return NextResponse.json([], { status: 200 })
  }
}

// POST /api/products/dosage-forms — Create a new dosage form
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = (body.name || '').trim().toUpperCase()
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (isTurso()) {
      // Check for duplicates
      const existing = await turso.execute({
        sql: `SELECT id FROM "DosageForm" WHERE UPPER(name) = ?`,
        args: [name],
      })
      if (existing.rows.length > 0) {
        return NextResponse.json({ error: 'Dosage form already exists', name }, { status: 409 })
      }
      const id = 'df_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
      await turso.execute({
        sql: `INSERT INTO "DosageForm" (id, name, "isActive", "createdAt", "updatedAt") VALUES (?, ?, 1, datetime('now'), datetime('now'))`,
        args: [id, name],
      })
      return NextResponse.json({ id, name }, { status: 201 })
    } else {
      const { db } = await import('@/lib/db')
      const existing = await db.dosageForm.findFirst({ where: { name } })
      if (existing) {
        return NextResponse.json({ error: 'Dosage form already exists', name }, { status: 409 })
      }
      const form = await db.dosageForm.create({ data: { name } })
      return NextResponse.json({ id: form.id, name: form.name }, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating dosage form:', error)
    return NextResponse.json({ error: 'Failed to create dosage form' }, { status: 500 })
  }
}

// PUT /api/products/dosage-forms — Rename a dosage form
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { oldName, newName } = body
    const trimmed = (newName || '').trim().toUpperCase()
    if (!oldName || !trimmed) {
      return NextResponse.json({ error: 'oldName and newName are required' }, { status: 400 })
    }

    if (isTurso()) {
      // Check new name not taken
      const dup = await turso.execute({ sql: `SELECT id FROM "DosageForm" WHERE UPPER(name) = ? AND name != ?`, args: [trimmed, oldName] })
      if (dup.rows.length > 0) {
        return NextResponse.json({ error: 'Dosage form already exists', name: trimmed }, { status: 409 })
      }
      await turso.execute({ sql: `UPDATE "DosageForm" SET name = ?, "updatedAt" = datetime('now') WHERE name = ?`, args: [trimmed, oldName] })
      // Also update any products using the old name
      await turso.execute({ sql: `UPDATE "Product" SET "dosageForm" = ?, "updatedAt" = datetime('now') WHERE "dosageForm" = ?`, args: [trimmed, oldName] })
      return NextResponse.json({ oldName, newName: trimmed })
    } else {
      const { db } = await import('@/lib/db')
      const dup = await db.dosageForm.findFirst({ where: { name: trimmed, NOT: { name: oldName } } })
      if (dup) {
        return NextResponse.json({ error: 'Dosage form already exists', name: trimmed }, { status: 409 })
      }
      await db.dosageForm.updateMany({ where: { name: oldName }, data: { name: trimmed } })
      // Update products using old name
      await db.product.updateMany({ where: { dosageForm: oldName }, data: { dosageForm: trimmed } })
      return NextResponse.json({ oldName, newName: trimmed })
    }
  } catch (error) {
    console.error('Error renaming dosage form:', error)
    return NextResponse.json({ error: 'Failed to rename dosage form' }, { status: 500 })
  }
}

// DELETE /api/products/dosage-forms — Soft-delete (set isActive = false)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const name = searchParams.get('name')
    if (!name) {
      return NextResponse.json({ error: 'name query param is required' }, { status: 400 })
    }

    if (isTurso()) {
      await turso.execute({ sql: `UPDATE "DosageForm" SET "isActive" = 0, "updatedAt" = datetime('now') WHERE name = ?`, args: [name] })
      return NextResponse.json({ deleted: name })
    } else {
      const { db } = await import('@/lib/db')
      await db.dosageForm.updateMany({ where: { name }, data: { isActive: false } })
      return NextResponse.json({ deleted: name })
    }
  } catch (error) {
    console.error('Error deleting dosage form:', error)
    return NextResponse.json({ error: 'Failed to delete dosage form' }, { status: 500 })
  }
}
