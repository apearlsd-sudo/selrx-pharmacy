import { NextRequest, NextResponse } from 'next/server'
import { ROLE_METADATA, DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATEGORIES, ALL_PERMISSION_KEYS } from '@/lib/permissions'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'
import { turso, isTurso, tursoExecute, generateId, safeArgs } from '@/lib/turso'

// ── Ensure SystemRole table exists (Turso path, idempotent) ──
let tableEnsured = false
async function ensureTable() {
  if (tableEnsured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "SystemRole" (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        label       TEXT NOT NULL,
        description TEXT,
        permissions TEXT NOT NULL DEFAULT '[]',
        color       TEXT NOT NULL DEFAULT 'bg-gray-100 text-gray-700 border-gray-200',
        "isSystem"  INTEGER NOT NULL DEFAULT 0,
        "isActive"  INTEGER NOT NULL DEFAULT 1,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    })
    tableEnsured = true
  } catch (err) {
    console.error('Failed to ensure SystemRole table:', err)
  }
}

/** Count users for a given role name */
async function countUsersForRole(roleName: string): Promise<number> {
  try {
    if (isTurso()) {
      const r = await tursoExecute({
        sql: `SELECT COUNT(*) as c FROM "User" WHERE role = ?`,
        args: [roleName],
      })
      return Number(r.rows[0]?.c ?? 0)
    } else {
      const { db } = await import('@/lib/db')
      return await db.user.count({ where: { role: roleName } })
    }
  } catch {
    return 0
  }
}

// GET /api/roles - List all roles (built-in from code + custom from DB)
export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    if (isTurso()) {
      await ensureTable()
    }

    // Build built-in roles list from in-code ROLE_METADATA
    const builtinRoleNames = Object.keys(ROLE_METADATA)
    const roles: Array<{
      id: string
      name: string
      label: string
      description: string | null
      permissions: string
      color: string
      isSystem: boolean
      isActive: boolean
      createdAt: string
      updatedAt: string
      _count: { users: number }
    }> = []

    for (const [name, meta] of Object.entries(ROLE_METADATA)) {
      const userCount = await countUsersForRole(name)
      roles.push({
        id: name,
        name,
        label: meta.label,
        description: meta.description,
        permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[name] || []),
        color: meta.color,
        isSystem: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _count: { users: userCount },
      })
    }

    // Fetch custom roles from DB (isSystem = false)
    try {
      if (isTurso()) {
        const result = await tursoExecute({
          sql: `SELECT * FROM "SystemRole" WHERE "isSystem" = 0`,
          args: [],
        })
        for (const row of result.rows) {
          const roleName = row.name as string
          const userCount = await countUsersForRole(roleName)
          roles.push({
            id: row.id as string,
            name: roleName,
            label: row.label as string,
            description: (row.description as string) || null,
            permissions: row.permissions as string,
            color: row.color as string,
            isSystem: false,
            isActive: Boolean(row.isActive),
            createdAt: row.createdAt as string,
            updatedAt: row.updatedAt as string,
            _count: { users: userCount },
          })
        }
      } else {
        const { db } = await import('@/lib/db')
        const customRoles = await db.systemRole.findMany({
          where: { isSystem: false },
          orderBy: { createdAt: 'desc' },
        })
        for (const cr of customRoles) {
          const userCount = await countUsersForRole(cr.name)
          roles.push({
            id: cr.id,
            name: cr.name,
            label: cr.label,
            description: cr.description,
            permissions: cr.permissions,
            color: cr.color,
            isSystem: false,
            isActive: cr.isActive,
            createdAt: cr.createdAt.toISOString(),
            updatedAt: cr.updatedAt.toISOString(),
            _count: { users: userCount },
          })
        }
      }
    } catch (err) {
      console.error('Error fetching custom roles from DB:', err)
    }

    return NextResponse.json(roles)
  } catch (error) {
    console.error('Error fetching roles:', error)
    return NextResponse.json(
      { error: 'Failed to fetch roles' },
      { status: 500 }
    )
  }
}

// POST /api/roles - Create a custom role (SUPER_ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only SUPER_ADMIN can create roles' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, label, description, permissions, color } = body

    if (!name || !label || !permissions) {
      return NextResponse.json(
        { error: 'name, label, and permissions are required' },
        { status: 400 }
      )
    }

    if (!/^[A-Z0-9_]+$/.test(name)) {
      return NextResponse.json(
        { error: 'Role name must be uppercase letters, numbers, and underscores only (e.g. SHIFT_LEAD)' },
        { status: 400 }
      )
    }

    // Check for duplicate in built-in roles
    if (ROLE_METADATA[name]) {
      return NextResponse.json(
        { error: 'A role with this name already exists' },
        { status: 409 }
      )
    }

    if (isTurso()) {
      await ensureTable()
    }

    const id = generateId()
    const now = new Date().toISOString()
    const permsJson = JSON.stringify(Array.isArray(permissions) ? permissions : [])
    const colorVal = color || 'bg-gray-100 text-gray-700 border-gray-200'

    try {
      if (isTurso()) {
        // Check duplicate in DB
        const existing = await tursoExecute({
          sql: `SELECT id FROM "SystemRole" WHERE name = ?`,
          args: [name],
        })
        if (existing.rows.length > 0) {
          return NextResponse.json(
            { error: 'A role with this name already exists' },
            { status: 409 }
          )
        }

        await tursoExecute({
          sql: `INSERT INTO "SystemRole" (id, name, label, description, permissions, color, "isSystem", "isActive", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
          args: safeArgs([id, name, label, description || null, permsJson, colorVal, now, now]),
        })
      } else {
        const { db } = await import('@/lib/db')
        // Check duplicate in DB
        const existing = await db.systemRole.findUnique({ where: { name } })
        if (existing) {
          return NextResponse.json(
            { error: 'A role with this name already exists' },
            { status: 409 }
          )
        }

        await db.systemRole.create({
          data: {
            id,
            name,
            label,
            description: description || null,
            permissions: permsJson,
            color: colorVal,
            isSystem: false,
            isActive: true,
          },
        })
      }
    } catch (err) {
      console.error('Error inserting custom role:', err)
      return NextResponse.json(
        { error: 'Failed to create role' },
        { status: 500 }
      )
    }

    const { userId, ipAddress, userAgent } = getRequestContext(request)
    writeAuditLog({ userId, action: 'ROLE_CREATED', category: 'role', entity: 'Role', entityId: id, details: { name, label }, ipAddress, userAgent }).catch(() => {})

    return NextResponse.json({
      id,
      name,
      label,
      description: description || null,
      permissions: permsJson,
      color: colorVal,
      isSystem: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating role:', error)
    return NextResponse.json(
      { error: 'Failed to create role' },
      { status: 500 }
    )
  }
}

// PUT /api/roles - Update a role (SUPER_ADMIN only)
export async function PUT(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only SUPER_ADMIN can update roles' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const roleId = searchParams.get('id')

    if (!roleId) {
      return NextResponse.json(
        { error: 'Role ID required' },
        { status: 400 }
      )
    }

    if (isTurso()) {
      await ensureTable()
    }

    // Find the custom role in DB by id or name
    let existing: any = null
    try {
      if (isTurso()) {
        const result = await tursoExecute({
          sql: `SELECT * FROM "SystemRole" WHERE (id = ? OR name = ?) AND "isSystem" = 0`,
          args: [roleId, roleId],
        })
        existing = result.rows[0] || null
      } else {
        const { db } = await import('@/lib/db')
        existing = await db.systemRole.findFirst({
          where: {
            OR: [{ id: roleId }, { name: roleId }],
            isSystem: false,
          },
        })
      }
    } catch (err) {
      console.error('Error finding role:', err)
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { label, description, permissions, color, isActive } = body
    const now = new Date().toISOString()

    try {
      if (isTurso()) {
        const updates: string[] = [`"updatedAt" = ?`]
        const args: unknown[] = [now]

        if (label !== undefined) { updates.push(`label = ?`); args.push(label) }
        if (description !== undefined) { updates.push(`description = ?`); args.push(description) }
        if (permissions !== undefined) {
          updates.push(`permissions = ?`)
          args.push(JSON.stringify(Array.isArray(permissions) ? permissions : permissions))
        }
        if (color !== undefined) { updates.push(`color = ?`); args.push(color) }
        if (isActive !== undefined) { updates.push(`"isActive" = ?`); args.push(isActive ? 1 : 0) }

        args.push(existing.id as string)
        await tursoExecute({
          sql: `UPDATE "SystemRole" SET ${updates.join(', ')} WHERE id = ?`,
          args: safeArgs(args),
        })

        // Re-fetch to return updated record
        const updated = await tursoExecute({
          sql: `SELECT * FROM "SystemRole" WHERE id = ?`,
          args: [existing.id],
        })
        existing = updated.rows[0]
      } else {
        const { db } = await import('@/lib/db')
        const data: any = { updatedAt: new Date() }
        if (label !== undefined) data.label = label
        if (description !== undefined) data.description = description
        if (permissions !== undefined) data.permissions = JSON.stringify(Array.isArray(permissions) ? permissions : permissions)
        if (color !== undefined) data.color = color
        if (isActive !== undefined) data.isActive = isActive

        existing = await db.systemRole.update({
          where: { id: (existing as any).id },
          data,
        })
      }
    } catch (err) {
      console.error('Error updating role:', err)
      return NextResponse.json(
        { error: 'Failed to update role' },
        { status: 500 }
      )
    }

    const { userId, ipAddress, userAgent } = getRequestContext(request)
    writeAuditLog({ userId, action: 'ROLE_UPDATED', category: 'role', entity: 'Role', entityId: (existing as any).id, details: { name: (existing as any).name }, ipAddress, userAgent }).catch(() => {})

    return NextResponse.json({
      id: (existing as any).id,
      name: (existing as any).name,
      label: (existing as any).label,
      description: (existing as any).description || null,
      permissions: (existing as any).permissions,
      color: (existing as any).color,
      isSystem: false,
      isActive: Boolean((existing as any).isActive),
      createdAt: (existing as any).createdAt,
      updatedAt: (existing as any).updatedAt,
    })
  } catch (error) {
    console.error('Error updating role:', error)
    return NextResponse.json(
      { error: 'Failed to update role' },
      { status: 500 }
    )
  }
}

// DELETE /api/roles - Delete a custom role (SUPER_ADMIN only)
export async function DELETE(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only SUPER_ADMIN can delete roles' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const roleId = searchParams.get('id')

    if (!roleId) {
      return NextResponse.json(
        { error: 'Role ID required' },
        { status: 400 }
      )
    }

    // Don't allow deleting built-in system roles
    if (ROLE_METADATA[roleId]) {
      return NextResponse.json(
        { error: 'Cannot delete system roles' },
        { status: 403 }
      )
    }

    if (isTurso()) {
      await ensureTable()
    }

    // Find the custom role in DB by id or name
    let existing: any = null
    try {
      if (isTurso()) {
        const result = await tursoExecute({
          sql: `SELECT * FROM "SystemRole" WHERE (id = ? OR name = ?) AND "isSystem" = 0`,
          args: [roleId, roleId],
        })
        existing = result.rows[0] || null
      } else {
        const { db } = await import('@/lib/db')
        existing = await db.systemRole.findFirst({
          where: {
            OR: [{ id: roleId }, { name: roleId }],
            isSystem: false,
          },
        })
      }
    } catch (err) {
      console.error('Error finding role for delete:', err)
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      )
    }

    // Delete from DB
    try {
      if (isTurso()) {
        await tursoExecute({
          sql: `DELETE FROM "SystemRole" WHERE id = ? AND "isSystem" = 0`,
          args: [(existing as any).id],
        })
      } else {
        const { db } = await import('@/lib/db')
        await db.systemRole.delete({
          where: { id: (existing as any).id },
        })
      }
    } catch (err) {
      console.error('Error deleting role:', err)
      return NextResponse.json(
        { error: 'Failed to delete role' },
        { status: 500 }
      )
    }

    const { userId, ipAddress, userAgent } = getRequestContext(request)
    writeAuditLog({ userId, action: 'ROLE_DELETED', category: 'role', entity: 'Role', entityId: (existing as any).id, details: { name: (existing as any).name }, ipAddress, userAgent }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting role:', error)
    return NextResponse.json(
      { error: 'Failed to delete role' },
      { status: 500 }
    )
  }
}
