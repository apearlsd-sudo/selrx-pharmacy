import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute, generateId, safeArgs } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ── Ensure PricingTier table exists (Turso path, idempotent) ──
let tableEnsured = false
async function ensureTable() {
  if (tableEnsured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "PricingTier" (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        description     TEXT,
        "discountPercent"  REAL NOT NULL DEFAULT 0,
        "isDefault"     INTEGER NOT NULL DEFAULT 0,
        "isActive"      INTEGER NOT NULL DEFAULT 1,
        "isSystem"      INTEGER NOT NULL DEFAULT 0,
        "createdAt"     TEXT NOT NULL DEFAULT (datetime('now')),
        "updatedAt"     TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    })
    // Self-healing: try adding isSystem column that may be missing
    try { await turso.execute({ sql: `ALTER TABLE "PricingTier" ADD COLUMN "isSystem" INTEGER NOT NULL DEFAULT 0`, args: [] }) } catch { /* already exists */ }
    tableEnsured = true
    console.log('[pricing-tiers] PricingTier table ensured')
  } catch (err) {
    console.error('[pricing-tiers] Failed to ensure table:', err)
  }
}

// GET /api/pricing-tiers — List all pricing tiers. ?active=true
export async function GET(request: NextRequest) {
  try {
    if (isTurso()) {
      await ensureTable()
    }

    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'

    if (isTurso()) {
      let sql = `SELECT * FROM "PricingTier"`
      const args: unknown[] = []
      if (activeOnly) {
        sql += ` WHERE "isActive" = 1`
      }
      sql += ` ORDER BY "discountPercent" DESC, "createdAt" ASC`
      const result = await tursoExecute({ sql, args: safeArgs(args) })
      const tiers = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description || null,
        discountPercent: Number(row.discountPercent ?? 0),
        isDefault: Boolean(row.isDefault),
        isActive: Boolean(row.isActive),
        isSystem: Boolean(row.isSystem),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }))
      return NextResponse.json(tiers)
    } else {
      const { db } = await import('@/lib/db')
      const where = activeOnly ? { isActive: true } : undefined
      const tiers = await db.pricingTier.findMany({
        where,
        orderBy: [{ discountPercent: 'desc' }, { createdAt: 'asc' }],
      })
      return NextResponse.json(tiers.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        discountPercent: t.discountPercent,
        isDefault: t.isDefault,
        isActive: t.isActive,
        isSystem: (t as any).isSystem ?? false,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })))
    }
  } catch (error) {
    console.error('Error fetching pricing tiers:', error)
    return NextResponse.json({ error: 'Failed to fetch pricing tiers' }, { status: 500 })
  }
}

// POST /api/pricing-tiers — Create a new tier (SUPER_ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only SUPER_ADMIN can create pricing tiers' }, { status: 403 })
    }

    const body = await request.json()
    const { name, description, discountPercent, isDefault, isActive } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (isTurso()) {
      await ensureTable()
    }

    // Check for duplicate name
    try {
      if (isTurso()) {
        const existing = await tursoExecute({
          sql: `SELECT id FROM "PricingTier" WHERE name = ?`,
          args: [name],
        })
        if (existing.rows.length > 0) {
          return NextResponse.json({ error: 'A pricing tier with this name already exists' }, { status: 409 })
        }
      } else {
        const { db } = await import('@/lib/db')
        const existing = await db.pricingTier.findUnique({ where: { name } })
        if (existing) {
          return NextResponse.json({ error: 'A pricing tier with this name already exists' }, { status: 409 })
        }
      }
    } catch (err) {
      console.error('Error checking duplicate tier:', err)
    }

    // If setting as default, unset any other default
    if (isDefault) {
      try {
        if (isTurso()) {
          await tursoExecute({
            sql: `UPDATE "PricingTier" SET "isDefault" = 0, "updatedAt" = datetime('now') WHERE "isDefault" = 1`,
            args: [],
          })
        } else {
          const { db } = await import('@/lib/db')
          await db.pricingTier.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
        }
      } catch (err) {
        console.error('Error unsetting default tier:', err)
      }
    }

    const id = generateId()
    const now = new Date().toISOString()
    const discount = Math.max(0, Math.min(100, Number(discountPercent ?? 0)))

    try {
      if (isTurso()) {
        await tursoExecute({
          sql: `INSERT INTO "PricingTier" (id, name, description, "discountPercent", "isDefault", "isActive", "isSystem", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          args: safeArgs([id, name, description || null, discount, isDefault ? 1 : 0, isActive !== false ? 1 : 0, now, now]),
        })
      } else {
        const { db } = await import('@/lib/db')
        await db.pricingTier.create({
          data: {
            id,
            name,
            description: description || null,
            discountPercent: discount,
            isDefault: Boolean(isDefault),
            isActive: isActive !== false,
          },
        })
      }
    } catch (err) {
      console.error('Error inserting pricing tier:', err)
      return NextResponse.json({ error: 'Failed to create pricing tier' }, { status: 500 })
    }

    const { userId, ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({ userId, action: 'PRICING_TIER_CREATED', category: 'pricing', entity: 'PricingTier', entityId: id, details: { name, discountPercent: discount }, ipAddress, userAgent }).catch(() => {})

    return NextResponse.json({
      id,
      name,
      description: description || null,
      discountPercent: discount,
      isDefault: Boolean(isDefault),
      isActive: isActive !== false,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating pricing tier:', error)
    return NextResponse.json({ error: 'Failed to create pricing tier' }, { status: 500 })
  }
}

// PATCH /api/pricing-tiers — Update a tier (SUPER_ADMIN only)
export async function PATCH(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only SUPER_ADMIN can update pricing tiers' }, { status: 403 })
    }

    const body = await request.json()
    const { id, name, description, discountPercent, isDefault, isActive } = body

    if (!id) {
      return NextResponse.json({ error: 'Tier ID is required' }, { status: 400 })
    }

    if (isTurso()) {
      await ensureTable()
    }

    // Find the tier
    let existing: any = null
    try {
      if (isTurso()) {
        const result = await tursoExecute({
          sql: `SELECT * FROM "PricingTier" WHERE id = ?`,
          args: [id],
        })
        existing = result.rows[0] || null
      } else {
        const { db } = await import('@/lib/db')
        existing = await db.pricingTier.findUnique({ where: { id } })
      }
    } catch (err) {
      console.error('Error finding pricing tier:', err)
    }

    if (!existing) {
      return NextResponse.json({ error: 'Pricing tier not found' }, { status: 404 })
    }

    // If setting as default, unset any other default
    if (isDefault === true && !existing.isDefault) {
      try {
        if (isTurso()) {
          await tursoExecute({
            sql: `UPDATE "PricingTier" SET "isDefault" = 0, "updatedAt" = datetime('now') WHERE "isDefault" = 1 AND id != ?`,
            args: [id],
          })
        } else {
          const { db } = await import('@/lib/db')
          await db.pricingTier.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } })
        }
      } catch (err) {
        console.error('Error unsetting default tier:', err)
      }
    }

    const now = new Date().toISOString()

    try {
      if (isTurso()) {
        const updates: string[] = [`"updatedAt" = ?`]
        const args: unknown[] = [now]

        if (name !== undefined) { updates.push(`name = ?`); args.push(name) }
        if (description !== undefined) { updates.push(`description = ?`); args.push(description) }
        if (discountPercent !== undefined) { updates.push(`"discountPercent" = ?`); args.push(Math.max(0, Math.min(100, Number(discountPercent)))) }
        if (isDefault !== undefined) { updates.push(`"isDefault" = ?`); args.push(isDefault ? 1 : 0) }
        if (isActive !== undefined) { updates.push(`"isActive" = ?`); args.push(isActive ? 1 : 0) }

        args.push(id as string)
        await tursoExecute({
          sql: `UPDATE "PricingTier" SET ${updates.join(', ')} WHERE id = ?`,
          args: safeArgs(args),
        })

        // Re-fetch
        const updated = await tursoExecute({
          sql: `SELECT * FROM "PricingTier" WHERE id = ?`,
          args: [id],
        })
        existing = updated.rows[0]
      } else {
        const { db } = await import('@/lib/db')
        const data: any = { updatedAt: new Date() }
        if (name !== undefined) data.name = name
        if (description !== undefined) data.description = description
        if (discountPercent !== undefined) data.discountPercent = Math.max(0, Math.min(100, Number(discountPercent)))
        if (isDefault !== undefined) data.isDefault = isDefault
        if (isActive !== undefined) data.isActive = isActive

        existing = await db.pricingTier.update({ where: { id }, data })
      }
    } catch (err) {
      console.error('Error updating pricing tier:', err)
      return NextResponse.json({ error: 'Failed to update pricing tier' }, { status: 500 })
    }

    const { userId, ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({ userId, action: 'PRICING_TIER_UPDATED', category: 'pricing', entity: 'PricingTier', entityId: id, details: { name: (existing as any).name }, ipAddress, userAgent }).catch(() => {})

    return NextResponse.json({
      id: (existing as any).id,
      name: (existing as any).name,
      description: (existing as any).description || null,
      discountPercent: Number((existing as any).discountPercent ?? 0),
      isDefault: Boolean((existing as any).isDefault),
      isActive: Boolean((existing as any).isActive),
      isSystem: Boolean((existing as any).isSystem),
      createdAt: (existing as any).createdAt,
      updatedAt: (existing as any).updatedAt,
    })
  } catch (error) {
    console.error('Error updating pricing tier:', error)
    return NextResponse.json({ error: 'Failed to update pricing tier' }, { status: 500 })
  }
}

// DELETE /api/pricing-tiers — Delete a non-system tier (SUPER_ADMIN only)
export async function DELETE(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only SUPER_ADMIN can delete pricing tiers' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const tierId = searchParams.get('id')

    if (!tierId) {
      return NextResponse.json({ error: 'Tier ID required' }, { status: 400 })
    }

    if (isTurso()) {
      await ensureTable()
    }

    // Find the tier
    let existing: any = null
    try {
      if (isTurso()) {
        const result = await tursoExecute({
          sql: `SELECT * FROM "PricingTier" WHERE id = ?`,
          args: [tierId],
        })
        existing = result.rows[0] || null
      } else {
        const { db } = await import('@/lib/db')
        existing = await db.pricingTier.findUnique({ where: { id: tierId } })
      }
    } catch (err) {
      console.error('Error finding pricing tier for delete:', err)
    }

    if (!existing) {
      return NextResponse.json({ error: 'Pricing tier not found' }, { status: 404 })
    }

    // Don't delete system tiers
    if (Boolean(existing.isSystem)) {
      return NextResponse.json({ error: 'Cannot delete system pricing tiers' }, { status: 403 })
    }

    try {
      if (isTurso()) {
        await tursoExecute({
          sql: `DELETE FROM "PricingTier" WHERE id = ? AND "isSystem" = 0`,
          args: [tierId],
        })
      } else {
        const { db } = await import('@/lib/db')
        await db.pricingTier.delete({ where: { id: tierId } })
      }
    } catch (err) {
      console.error('Error deleting pricing tier:', err)
      return NextResponse.json({ error: 'Failed to delete pricing tier' }, { status: 500 })
    }

    const { userId, ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({ userId, action: 'PRICING_TIER_DELETED', category: 'pricing', entity: 'PricingTier', entityId: tierId, details: { name: (existing as any).name }, ipAddress, userAgent }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting pricing tier:', error)
    return NextResponse.json({ error: 'Failed to delete pricing tier' }, { status: 500 })
  }
}
