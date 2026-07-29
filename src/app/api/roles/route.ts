import { NextRequest, NextResponse } from 'next/server'
import { ROLE_METADATA, DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATEGORIES, ALL_PERMISSION_KEYS } from '@/lib/permissions'

// In-memory store for custom roles (persists only for the lifetime of the serverless function)
// Since SystemRole table may not exist in the DB, we use in-code defaults + any custom overrides
let customRoles: Record<string, {
  id: string
  name: string
  label: string
  description: string | null
  permissions: string[]
  color: string
  isSystem: boolean
  isActive: boolean
}> = {}

// GET /api/roles - List all roles (built from in-code metadata)
export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Build roles list from in-code ROLE_METADATA
    const roles = Object.entries(ROLE_METADATA).map(([name, meta]) => ({
      id: name, // use name as ID since we don't have DB IDs
      name,
      label: meta.label,
      description: meta.description,
      permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[name] || []),
      color: meta.color,
      isSystem: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _count: { users: 0 }, // we can't count without DB query
    }))

    // Add any custom roles created during this server session
    Object.values(customRoles).forEach(cr => {
      roles.push({
        ...cr,
        permissions: JSON.stringify(cr.permissions),
        _count: { users: 0 },
      })
    })

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

    // Check for duplicate in built-in roles or custom roles
    if (ROLE_METADATA[name] || customRoles[name]) {
      return NextResponse.json(
        { error: 'A role with this name already exists' },
        { status: 409 }
      )
    }

    const id = `custom_${name}_${Date.now()}`
    customRoles[name] = {
      id,
      name,
      label,
      description: description || null,
      permissions: Array.isArray(permissions) ? permissions : [],
      color: color || 'bg-gray-100 text-gray-700 border-gray-200',
      isSystem: false,
      isActive: true,
    }

    return NextResponse.json(customRoles[name], { status: 201 })
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

    // Find by ID or name
    const existing = customRoles[roleId] || Object.values(customRoles).find(r => r.id === roleId)

    if (!existing) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { label, description, permissions, color, isActive } = body

    if (label !== undefined) existing.label = label
    if (description !== undefined) existing.description = description
    if (permissions !== undefined) existing.permissions = Array.isArray(permissions) ? permissions : existing.permissions
    if (color !== undefined) existing.color = color
    if (isActive !== undefined) existing.isActive = isActive

    return NextResponse.json(existing)
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

    const existing = customRoles[roleId] || Object.values(customRoles).find(r => r.id === roleId)
    if (!existing) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      )
    }

    // Remove from custom roles
    delete customRoles[existing.name]
    // Also try removing by the roleId itself if it's stored that way
    const keyToDelete = Object.keys(customRoles).find(k => customRoles[k].id === roleId)
    if (keyToDelete) delete customRoles[keyToDelete]

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting role:', error)
    return NextResponse.json(
      { error: 'Failed to delete role' },
      { status: 500 }
    )
  }
}
