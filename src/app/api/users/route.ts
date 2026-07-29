import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/users - List all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN' && role !== 'PHARMACIST') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // GET /api/users?action=roles - List available roles for dropdown
    if (action === 'roles') {
      const roles = await db.systemRole.findMany({
        where: { isActive: true },
        orderBy: { isSystem: 'desc' },
        select: { name: true, label: true, color: true, isSystem: true },
      })
      return NextResponse.json(roles)
    }

    // GET /api/users/profile - Get own profile
    if (action === 'profile') {
      const userId = request.headers.get('x-user-id')
      if (!userId) {
        return NextResponse.json(
          { error: 'User ID required' },
          { status: 400 }
        )
      }

      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          licenseNumber: true,
          permissions: true,
          active: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(user)
    }

    const users = await db.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        licenseNumber: true,
        permissions: true,
        department: true,
        shift: true,
        hireDate: true,
        active: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(users)
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

// POST /api/users - Create user (SUPER_ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only SUPER_ADMIN can create users' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, password, name, userRole, phone, licenseNumber, permissions, department, shift, hireDate } = body

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'username/email, password, and name are required' },
        { status: 400 }
      )
    }

    // Validate username/email: allow alphanumeric, dots, hyphens, underscores, and @ for emails
    const usernameRegex = /^[a-zA-Z0-9._@-]+$/
    if (!usernameRegex.test(email)) {
      return NextResponse.json(
        { error: 'Username can only contain letters, numbers, dots, hyphens, and underscores' },
        { status: 400 }
      )
    }

    // Check for duplicate email/username
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: 'A user with this username or email already exists' },
        { status: 409 }
      )
    }

    const user = await db.user.create({
      data: {
        email,
        password, // Demo mode: plain text password
        name,
        role: userRole || 'CLERK',
        phone,
        licenseNumber,
        permissions: permissions ? JSON.stringify(permissions) : null,
        department: department || null,
        shift: shift || null,
        hireDate: hireDate || null,
        active: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        licenseNumber: true,
        permissions: true,
        department: true,
        shift: true,
        hireDate: true,
        active: true,
        createdAt: true,
      },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
}

// PUT /api/users - Update user (role/status or own profile)
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const targetUserId = searchParams.get('id')

    // PUT /api/users/profile - Update own profile
    if (action === 'profile') {
      const userId = request.headers.get('x-user-id')
      if (!userId) {
        return NextResponse.json(
          { error: 'User ID required' },
          { status: 400 }
        )
      }

      const body = await request.json()
      const { name, phone, licenseNumber } = body

      const user = await db.user.update({
        where: { id: userId },
        data: {
          name: name !== undefined ? name : undefined,
          phone: phone !== undefined ? phone : undefined,
          licenseNumber: licenseNumber !== undefined ? licenseNumber : undefined,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          licenseNumber: true,
          active: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      return NextResponse.json(user)
    }

    // PUT /api/users/[id] - Update user role/status (admin only)
    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      )
    }

    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only SUPER_ADMIN can update user roles' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { userRole, active, permissions, phone, licenseNumber, department, shift } = body

    const existing = await db.user.findUnique({ where: { id: targetUserId } })
    if (!existing) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const user = await db.user.update({
      where: { id: targetUserId },
      data: {
        role: userRole !== undefined ? userRole : undefined,
        active: active !== undefined ? active : undefined,
        permissions: permissions !== undefined ? JSON.stringify(permissions) : undefined,
        phone: phone !== undefined ? phone : undefined,
        licenseNumber: licenseNumber !== undefined ? licenseNumber : undefined,
        department: department !== undefined ? department : undefined,
        shift: shift !== undefined ? shift : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        licenseNumber: true,
        permissions: true,
        department: true,
        shift: true,
        hireDate: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}

// DELETE /api/users?id=<userId> - Delete user (SUPER_ADMIN only)
export async function DELETE(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only SUPER_ADMIN can delete users' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('id')
    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      )
    }

    // Prevent self-deletion
    const callerId = request.headers.get('x-user-id')
    if (callerId === targetUserId) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 400 }
      )
    }

    const existing = await db.user.findUnique({ where: { id: targetUserId } })
    if (!existing) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    await db.user.delete({ where: { id: targetUserId } })

    return NextResponse.json({ success: true, message: `User "${existing.name}" deleted` })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    )
  }
}
