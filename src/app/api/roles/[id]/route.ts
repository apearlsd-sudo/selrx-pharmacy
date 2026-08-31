import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  parsePermissions,
  sanitizePermissions,
  DEFAULT_ROLES,
} from '@/lib/permissions'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/roles/[id]
 * Returns a single role by ID with its permissions parsed.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id } = await params
    const role = await db.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    })

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      color: role.color,
      isSystem: role.isSystem,
      isDefault: role.isDefault,
      permissions: parsePermissions(role.permissions),
      userCount: role._count.users,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    })
  } catch (error) {
    console.error('Error fetching role:', error)
    return NextResponse.json({ error: 'Failed to fetch role' }, { status: 500 })
  }
}

/**
 * PUT /api/roles/[id]
 * Update a role. System roles can have their permissions/description/color
 * updated but cannot be renamed or deleted. Custom roles can be fully edited.
 *
 * Requires `roles:manage` permission (or SUPER_ADMIN).
 *
 * Body (all optional):
 *   - displayName?: string
 *   - description?: string
 *   - color?: string
 *   - permissions?: string[]
 *   - isDefault?: boolean
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const userRole = request.headers.get('x-user-role')
    const userPermsRaw = request.headers.get('x-user-permissions')
    const userPerms = parsePermissions(userPermsRaw)

    const isSuperAdmin = userRole === 'SUPER_ADMIN'
    const canManageRoles = userPerms.includes('roles:manage')
    if (!isSuperAdmin && !canManageRoles) {
      return NextResponse.json(
        { error: 'Insufficient permissions: requires roles:manage' },
        { status: 403 }
      )
    }

    const { id } = await params
    const existing = await db.role.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    }

    const body = await request.json()
    const { displayName, description, color, permissions, isDefault, name } = body

    // System role rename is forbidden (would break FK references and seeded data)
    if (name && name !== existing.name) {
      if (existing.isSystem) {
        return NextResponse.json(
          { error: 'System role names cannot be renamed' },
          { status: 400 }
        )
      }
      // Check uniqueness for custom role rename
      const normalizedName = String(name).trim().toUpperCase().replace(/\s+/g, '_')
      const systemRoleNames = new Set(DEFAULT_ROLES.map((r) => r.name))
      if (systemRoleNames.has(normalizedName)) {
        return NextResponse.json(
          { error: `Name "${normalizedName}" is reserved for a system role` },
          { status: 409 }
        )
      }
      const conflict = await db.role.findUnique({ where: { name: normalizedName } })
      if (conflict && conflict.id !== id) {
        return NextResponse.json(
          { error: `A role with name "${normalizedName}" already exists` },
          { status: 409 }
        )
      }
    }

    // Validate color if provided
    const validColors = ['red', 'emerald', 'sky', 'amber', 'gray', 'violet', 'pink', 'teal']
    if (color && !validColors.includes(color)) {
      return NextResponse.json({ error: `Invalid color: ${color}` }, { status: 400 })
    }

    // Sanitize permissions if provided
    let permsJson: string | undefined
    if (Array.isArray(permissions)) {
      permsJson = JSON.stringify(sanitizePermissions(permissions))
    }

    // If marking as default, unset default on all other roles
    if (isDefault === true) {
      await db.role.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      })
    }

    const updated = await db.role.update({
      where: { id },
      data: {
        name: name ? String(name).trim().toUpperCase().replace(/\s+/g, '_') : undefined,
        displayName: displayName !== undefined ? String(displayName).trim() : undefined,
        description: description !== undefined ? (description ? String(description).trim() : null) : undefined,
        color: color || undefined,
        permissions: permsJson,
        isDefault: isDefault !== undefined ? !!isDefault : undefined,
      },
      include: { _count: { select: { users: true } } },
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      displayName: updated.displayName,
      description: updated.description,
      color: updated.color,
      isSystem: updated.isSystem,
      isDefault: updated.isDefault,
      permissions: parsePermissions(updated.permissions),
      userCount: updated._count.users,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (error) {
    console.error('Error updating role:', error)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
}

/**
 * DELETE /api/roles/[id]
 * Delete a custom role. System roles cannot be deleted.
 * If users are still assigned to the role, deletion is blocked — admin must
 * reassign them first (the API returns the count to make this clear).
 *
 * Requires `roles:manage` permission (or SUPER_ADMIN).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userRole = request.headers.get('x-user-role')
    const userPermsRaw = request.headers.get('x-user-permissions')
    const userPerms = parsePermissions(userPermsRaw)

    const isSuperAdmin = userRole === 'SUPER_ADMIN'
    const canManageRoles = userPerms.includes('roles:manage')
    if (!isSuperAdmin && !canManageRoles) {
      return NextResponse.json(
        { error: 'Insufficient permissions: requires roles:manage' },
        { status: 403 }
      )
    }

    const { id } = await params
    const existing = await db.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    }

    if (existing.isSystem) {
      return NextResponse.json(
        { error: 'System roles cannot be deleted. Edit the permissions instead.' },
        { status: 400 }
      )
    }

    if (existing._count.users > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete: ${existing._count.users} user(s) are still assigned to this role. Reassign them first.`,
          userCount: existing._count.users,
        },
        { status: 409 }
      )
    }

    await db.role.delete({ where: { id } })

    return NextResponse.json({ success: true, message: `Role "${existing.name}" deleted` })
  } catch (error) {
    console.error('Error deleting role:', error)
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 })
  }
}
