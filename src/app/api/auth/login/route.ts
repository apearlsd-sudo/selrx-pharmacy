import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ALL_PERMISSION_KEYS } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // Try to find user by email field (which also stores usernames)
    const user = await db.user.findUnique({
      where: { email },
      include: { systemRole: true },
    })

    if (!user || user.password !== password || !user.active) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

    // Resolve permissions with this priority:
    // 1. SUPER_ADMIN always gets ALL permissions
    // 2. User-level override permissions (stored in user.permissions)
    // 3. SystemRole permissions (fallback when user has no custom override)
    let permissions: string[] = []

    if (user.role === 'SUPER_ADMIN') {
      permissions = [...ALL_PERMISSION_KEYS]
    } else if (user.permissions) {
      try {
        const parsed = JSON.parse(user.permissions)
        if (Array.isArray(parsed) && parsed.length > 0) {
          permissions = parsed
        }
      } catch {
        permissions = []
      }
    }

    // Fallback: load permissions from the SystemRole
    if (permissions.length === 0 && user.systemRole) {
      try {
        const rolePerms = JSON.parse(user.systemRole.permissions)
        if (Array.isArray(rolePerms)) {
          permissions = rolePerms
        }
      } catch {
        permissions = []
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleLabel: user.systemRole?.label || user.role,
        permissions,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
