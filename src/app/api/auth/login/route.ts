import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ALL_PERMISSION_KEYS, ROLE_METADATA, DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // Simple query — no include on SystemRole to avoid query failures
    // if the table is missing or the relation has no matching row.
    const user = await db.user.findUnique({
      where: { email },
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
    // 2. User-level override permissions (stored in user.permissions JSON)
    // 3. Default role permissions from in-code DEFAULT_ROLE_PERMISSIONS map
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

    // Fallback: use in-code default permissions for the role
    if (permissions.length === 0) {
      permissions = DEFAULT_ROLE_PERMISSIONS[user.role] ?? []
    }

    // Resolve role label from in-code metadata (no DB lookup needed)
    const roleLabel = ROLE_METADATA[user.role]?.label || user.role

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleLabel,
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
