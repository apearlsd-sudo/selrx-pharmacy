import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/roles - List all system roles
export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const roles = await db.systemRole.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { users: true } },
      },
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

// POST /api/roles - Create a new role (SUPER_ADMIN only)
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

    // Validate name format: uppercase letters, numbers, underscores
    if (!/^[A-Z0-9_]+$/.test(name)) {
      return NextResponse.json(
        { error: 'Role name must be uppercase letters, numbers, and underscores only (e.g. SHIFT_LEAD)' },
        { status: 400 }
      )
    }

    // Check for duplicate name
    const existing = await db.systemRole.findUnique({ where: { name } })
    if (existing) {
      return NextResponse.json(
        { error: 'A role with this name already exists' },
        { status: 409 }
      )
    }

    const newRole = await db.systemRole.create({
      data: {
        name,
        label,
        description: description || null,
        permissions: JSON.stringify(permissions),
        color: color || 'bg-gray-100 text-gray-700 border-gray-200',
        isSystem: false,
        active: true,
      },
    })

    return NextResponse.json(newRole, { status: 201 })
  } catch (error) {
    console.error('Error creating role:', error)
    return NextResponse.json(
      { error: 'Failed to create role' },
      { status: 500 }
    )
  }
}

// PUT /api/roles - Update a role (SUPER_ADMIN only, cannot modify system roles' name)
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

    const existing = await db.systemRole.findUnique({ where: { id: roleId } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      )
    }

    if (existing.name === 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Cannot modify the SUPER_ADMIN role' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { label, description, permissions, color, isActive } = body

    const updated = await db.systemRole.update({
      where: { id: roleId },
      data: {
        ...(label !== undefined ? { label } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(permissions !== undefined ? { permissions: JSON.stringify(permissions) } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating role:', error)
    return NextResponse.json(
      { error: 'Failed to update role' },
      { status: 500 }
    )
  }
}

// DELETE /api/roles - Delete a custom role (SUPER_ADMIN only, cannot delete system roles or roles with users)
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

    const existing = await db.systemRole.findUnique({
      where: { id: roleId },
      include: { _count: { select: { users: true } } },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      )
    }

    if (existing.isSystem) {
      return NextResponse.json(
        { error: 'Cannot delete system roles' },
        { status: 403 }
      )
    }

    if (existing._count.users > 0) {
      return NextResponse.json(
        { error: `Cannot delete role: ${existing._count.users} user(s) are assigned to this role. Reassign them first.` },
        { status: 409 }
      )
    }

    await db.systemRole.delete({ where: { id: roleId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting role:', error)
    return NextResponse.json(
      { error: 'Failed to delete role' },
      { status: 500 }
    )
  }
}
